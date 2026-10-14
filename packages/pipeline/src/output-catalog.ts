import { buildOutputSources, firstCatalogEntries, conflictingCatalogHashes, translatedDisplayEntries } from "./output-sources.js"
import { retainedCoreTts } from "./retained-catalog.js"
import { supportsPageBatchedSpeech } from "./speech-batch.js"
import { buildImageTranslationConfig } from "./image-translation.js"
import path from "node:path"
import { bookAssetExists, type Storage } from "@adt/storage"
import { createPromptEngine } from "@adt/llm"
import { isTtsExcluded, voiceSlotEntryId, type AppConfig, type TextCatalogEntry, type TextCatalogOutput, type ImageCaptioningOutput, type TTSOutput, type WordTimestampOutput, type OutputStatus, type OutputMetadata, type TranslatedImageAsset } from "@adt/types"
import { buildCaptionConfig } from "./image-captioning.js"
import { buildCatalogTranslationConfig, getTargetLanguages, translationInputSignature } from "./catalog-translation.js"
import { conflictingEasyReadHashes, buildEasyReadConfig, easyReadInputSignature, flattenEasyReadEntries, indexEasyReadEntries } from "./easy-read.js"
import { buildCoreTtsPreparationConfig, buildCoreTtsSourceContext, resolveCoreTtsSpeechCatalog, coreTtsInputBasis, loadCoreTtsProfiles, resolveCoreTtsProfile } from "./core-tts.js"
import { normalizeLocale, getBaseLanguage } from "./language-context.js"
import { deriveOutputStatus, inputSignature, outputIdentityKey, withOutputLocations } from "./output-freshness.js"
import { speechPageId, isSpeakableText, computePageSpeechInputSignature, computeSpeechCacheKey, loadVoicesConfig, loadSpeechInstructions, resolveSpeechVoice, resolveSpeechFormat, resolveInstructions, stripEmojis, elevenLabsVoiceSettingsFromConfig, findAdjacentSpeechText } from "./speech.js"

export function captionInputSignature(options: { language: string; summary?: string; config: ReturnType<typeof buildCaptionConfig>; prompt: string }): string {
  return inputSignature({ language: options.language,
    summary: options.summary, prompt: options.prompt, model: options.config.modelId,
    userPrompt: options.config.userPrompt, gradeLevel: options.config.gradeLevel })
}

/** Read-only projection. Expected work comes from sources, including inputs for
 * which no successful output exists. The caller owns storage and admission. */
export function readOutputCatalog(options: {
  storage: Storage; config: AppConfig; bookDir: string; promptsDir: string; configDir: string
  onConflicts?: (conflicts: import("@adt/types").CatalogConflict[]) => void
  kinds?: import("@adt/types").OutputKind[]
}): OutputStatus[] {
  // One synchronous SQLite read transaction avoids thousands of WASM file-lock
  // round trips and keeps versions consistent within the projection. No result
  // survives this read: the next request rechecks data, config and assets.
  return options.storage.readSnapshot(() => projectOutputCatalog(options))
}

function projectOutputCatalog(options: Parameters<typeof readOutputCatalog>[0]): OutputStatus[] {
  const { config, bookDir, promptsDir, configDir } = options
  // Source builders share the same rows within this synchronous projection.
  // Discard these lookups at return so edits/restores never see a stale view.
  const nodes = new Map<string, ReturnType<Storage["getLatestNodeData"]>>()
  const images = new Map<string, ReturnType<Storage["getImageMeta"]>>()
  const storage: Storage = { ...options.storage,
    getLatestNodeData(node, itemId) {
      const key = JSON.stringify([node, itemId])
      if (!nodes.has(key)) nodes.set(key, options.storage.getLatestNodeData(node, itemId))
      return nodes.get(key)!
    },
    getImageMeta(id) {
      if (!images.has(id)) images.set(id, options.storage.getImageMeta(id))
      return images.get(id)!
    },
  }
  const assets = new Map<string, boolean>()
  const available = (relative: string) => {
    if (!assets.has(relative)) assets.set(relative, bookAssetExists(bookDir, relative))
    return assets.get(relative)!
  }
  const sourceLanguage = normalizeLocale(config.editing_language ?? (storage.getLatestNodeData("metadata", "book")?.data as { language_code?: string })?.language_code ?? "en")
  const languages = [...new Set([sourceLanguage, ...(config.output_languages ?? []).map(normalizeLocale)])]
  const engine = createPromptEngine([path.join(bookDir, "prompts"), promptsDir], { basePromptModelId: config.base_prompt_model })
  const fingerprints = new Map<string, string>()
  const prompt = (name: string, model: string) => {
    const key = JSON.stringify([name, model])
    if (!fingerprints.has(key)) {
      try { fingerprints.set(key, engine.fingerprint(name, { modelId: model })) }
      catch { fingerprints.set(key, inputSignature({ missingPrompt: name, model })) }
    }
    return fingerprints.get(key)!
  }
  const { inventory, catalog, entries: sources, easyBlocks, easy } = buildOutputSources(storage, config)
  options.onConflicts?.(catalog.conflicts ?? [])
  const selected = (items: OutputStatus[]) => options.kinds ? items.filter((item) => options.kinds!.includes(item.identity.kind)) : items
  const conflictedIds = new Set(catalog.conflicts?.map((conflict) => conflict.id))
  const inheritSourceConflicts = (status: OutputStatus, ids: string[]) => {
    for (const id of new Set(ids)) if (!status.excluded && conflictedIds.has(id) && !status.warnings.some((warning) => warning.conflictId === id)) {
      status.current = false
      status.warnings.push({ reason: "source-conflict", conflictId: id })
    }
    return status
  }
  const dependencies = new Map<string, string[]>()
  const statuses: OutputStatus[] = []
  const byKey = new Map<string, OutputStatus>()
  const add = (status: OutputStatus) => {
    if (["translation", "preparation"].includes(status.identity.kind)) inheritSourceConflicts(status, [status.identity.id])
    if (status.identity.kind === "easy-read") inheritSourceConflicts(status, easyBlocks.filter((block) => block.entries.some((entry) => entry.easyReadId === status.identity.id)).flatMap((block) => block.entries.map((entry) => entry.sourceId)))
    statuses.push(status); byKey.set(outputIdentityKey(status.identity), status); return status
  }
  const find = (kind: OutputStatus["identity"]["kind"], id: string, language?: string) => byKey.get(outputIdentityKey({ kind, id, language }))
  const decorativeImages = new Set<string>()
  const captionConfig = buildCaptionConfig(config)
  const captionsByPage = new Map<string, ImageCaptioningOutput | undefined>()
  const summary = (storage.getLatestNodeData("book-summary", "book")?.data as { summary?: string })?.summary
  for (const image of inventory) {
    if (image.pageId && !captionsByPage.has(image.pageId)) captionsByPage.set(image.pageId, storage.getLatestNodeData("image-captioning", image.pageId)?.data as ImageCaptioningOutput | undefined)
    const previous = image.pageId ? captionsByPage.get(image.pageId)?.captions.find((entry) => entry.imageId === image.id) : undefined
    if (previous?.decorative) decorativeImages.add(image.id)
    const status = deriveOutputStatus({ identity: { kind: "caption", id: image.id },
      signature: captionInputSignature({ language: sourceLanguage, summary, config: captionConfig, prompt: prompt(captionConfig.promptName, captionConfig.modelId) }),
      content: previous ? { caption: previous.caption, decorative: previous.decorative === true } : undefined,
      metadata: previous, usable: !!previous && (previous.decorative === true || !!previous.caption.trim()),
    })
    add({ ...status, locations: image.locations, pageIds: image.pageIds, sectionIds: image.sectionIds, group: image.glossary ? "glossary" : undefined })
  }
  if (options.kinds?.every((kind) => kind === "caption")) return selected(statuses)
  const imageConfig = buildImageTranslationConfig(config)
  for (const image of inventory) for (const language of getTargetLanguages(languages, sourceLanguage)) {
    const itemId = `${image.id}_tr_${language}`
    const previous = storage.getLatestNodeData("image-translation", itemId)?.data as TranslatedImageAsset | undefined
    const legacy = storage.getImageMeta(itemId)
    const relativePath = previous?.relativePath ?? legacy?.relativePath
    const usable = !!relativePath && available(relativePath)
    const hash = previous?.hash ?? relativePath
    add({ ...deriveOutputStatus({ identity: { kind: "image-translation", id: image.id, language },
      signature: inputSignature({ sourceLanguage, language, model: imageConfig.modelId, prompt: prompt(config.image_translation?.prompt ?? "image_translation", imageConfig.modelId) }),
      content: hash, metadata: previous, usable,
      excluded: !imageConfig.enabled || !imageConfig.selectedImageIds.includes(image.id),
    }), locations: image.locations, pageIds: image.pageIds, sectionIds: image.sectionIds, group: image.glossary ? "glossary" : undefined })
  }
  const easyConfig = buildEasyReadConfig(config, sourceLanguage)
  easyConfig.promptSignature = prompt(easyConfig.promptName, easyConfig.modelId)
  const easyConflicts = conflictingEasyReadHashes(easy)
  const easySources = indexEasyReadEntries({ blocks: easyBlocks, generatedAt: "" })
  const easyById = new Map(flattenEasyReadEntries(easy).map((entry) => [entry.id, entry]))
  if (easyConfig.enabled) for (const entry of flattenEasyReadEntries({ blocks: easyBlocks, generatedAt: "" })) {
    const previous = easyById.get(entry.id)
    const source = { id: entry.id, text: previous?.text ?? "", locations: entry.locations }
    const status = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "easy-read", id: entry.id, language: sourceLanguage },
      signature: easyReadInputSignature(easyBlocks, entry.id.slice(0, -"_easy_read".length), easyConfig), content: previous?.text, metadata: previous, usable: !!previous?.text.trim(),
    }), { ...source, text: easySources.get(entry.id)!.originalText }))
    if (easyConflicts.has(entry.id)) {
      status.contentHash = easyConflicts.get(entry.id)!
      status.current = false
      status.protected = true
      status.updateNeeded = false
      status.warnings.push({ reason: "output-conflict", conflictId: entry.id })
    }
  }
  const translationConfig = buildCatalogTranslationConfig(config, sourceLanguage)
  translationConfig.promptSignature = prompt(translationConfig.promptName, translationConfig.modelId)
  const displays = new Map<string, TextCatalogEntry[]>([[sourceLanguage, sources]])
  const sourceStatus = (entry: TextCatalogEntry) => find("caption", entry.id) ?? find("easy-read", entry.id, sourceLanguage)
  for (const language of getTargetLanguages(languages, sourceLanguage)) {
    const prior = ((storage.getLatestNodeData("text-catalog-translation", language) ?? storage.getLatestNodeData("text-catalog-translation", language.replace("-", "_")))?.data as TextCatalogOutput | undefined)?.entries ?? []
    const byId = firstCatalogEntries(prior)
    const conflicts = conflictingCatalogHashes(prior)
    const display = translatedDisplayEntries(storage, language, sources)
    for (const source of sources) {
      const previous = byId.get(source.id)
      const upstream = sourceStatus(source)
      const status = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "translation", id: source.id, language },
        signature: translationInputSignature(source, language, translationConfig), content: previous?.text, metadata: previous, usable: !!previous?.text.trim(), upstream: upstream ? [upstream] : [],
      }), source))
      if (conflicts.has(source.id)) {
        status.contentHash = conflicts.get(source.id)!
        status.current = false
        status.protected = true
        status.updateNeeded = false
        status.warnings.push({ reason: "output-conflict", conflictId: source.id })
      }
    }
    displays.set(language, display)
  }
  if (options.kinds?.every((kind) => !["preparation", "audio", "timestamps"].includes(kind))) return selected(statuses)
  const preparation = buildCoreTtsPreparationConfig(config)
  preparation.promptSignature = prompt(preparation.promptName, preparation.modelId)
  const profiles = loadCoreTtsProfiles(configDir)
  const sourceCore = retainedCoreTts(storage, sourceLanguage, sources.map((entry) => entry.id))
  const effectiveSourceCore = resolveCoreTtsSpeechCatalog({ entries: sources, language: sourceLanguage, config: preparation, profile: resolveCoreTtsProfile(sourceLanguage, profiles), previous: sourceCore })
  const sourceContext = buildCoreTtsSourceContext(sources, effectiveSourceCore)
  const voices = loadVoicesConfig(configDir)
  const instructions = loadSpeechInstructions(configDir)
  const sourceBaseLanguage = getBaseLanguage(sourceLanguage)
  for (const language of languages) {
    const usesSourceText = getBaseLanguage(language) === sourceBaseLanguage
    const profile = resolveCoreTtsProfile(language, profiles)
    const resolvedVoices = (["primary", "secondary"] as const).map((voiceSlot) => ({ voiceSlot,
      voice: resolveSpeechVoice(language, voiceSlot, config.speech, voices, config.speech?.model ?? config.default_speech_generation_model),
    }))
    const entries = usesSourceText ? sources : displays.get(language) ?? []
    const core = retainedCoreTts(storage, language, entries.map((entry) => entry.id))
    const coreById = new Map((core?.entries ?? []).map((entry) => [entry.id, entry]))
    const audio = ((storage.getLatestNodeData("tts", language) ?? storage.getLatestNodeData("tts", language.replace("-", "_")))?.data as TTSOutput | undefined)?.entries ?? []
    const timings = ((storage.getLatestNodeData("tts-timestamps", language) ?? storage.getLatestNodeData("tts-timestamps", language.replace("-", "_")))?.data as WordTimestampOutput | undefined)?.entries
    const effectiveCore = resolveCoreTtsSpeechCatalog({ entries, language, config: preparation, profile, previous: core, sourceContext: language === sourceLanguage ? undefined : sourceContext })
    const effectiveById = new Map(effectiveCore.entries.map((entry) => [entry.id, entry]))
    const pageOf = (entry: TextCatalogEntry) => speechPageId(entry.id, entry.locations?.flatMap((location) => location.pageId ? [location.pageId] : []))
    const speechEntries = entries.map((entry) => ({ ...entry, text: effectiveById.get(entry.id)?.speechText ?? entry.text }))
    for (let index = 0; index < entries.length; index++) {
      const source = entries[index]
      const previous = effectiveById.get(source.id) ?? coreById.get(source.id)
      const { signature, input } = coreTtsInputBasis({ entries, index, language, config: preparation, profile, sourceContext: language === sourceLanguage ? undefined : sourceContext })
      const upstream = usesSourceText ? sourceStatus(source) : find("translation", source.id, language)
      const metadata: OutputMetadata | undefined = previous?.generation.mode === "manual" ? { ...previous, source: "manual" } : previous
      // Easy Read is read aloud unless muted in Read-Aloud Content (the
      // "easy-read" category) or per entry, as before this spec. The unused
      // `easy_read.tts` config field has no Studio control and must not gate it.
      const speechExcluded = isTtsExcluded(source.id, config.speech) || (!!source.text.trim() && !isSpeakableText(stripEmojis(source.text).trim()))
      const prepStatus = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "preparation", id: source.id, language }, signature,
        content: previous?.speechText, metadata, excluded: speechExcluded, usable: !!previous?.speechText?.trim(), fallback: previous?.fallbackReason, upstream: upstream ? [upstream] : [],
      }), source))
      const contextWarnings = (input.enabled_transformations.length ? entries.slice(Math.max(0, index - 1), index + 2) : [source]).flatMap((entry) => {
        const status = usesSourceText ? sourceStatus(entry) : find("translation", entry.id, language)
        return status ? [outputIdentityKey(status.identity)] : []
      })
      inheritSourceConflicts(prepStatus, (input.enabled_transformations.length ? entries.slice(Math.max(0, index - 1), index + 2) : [source]).map((entry) => entry.id))
      if (input.enabled_transformations.length && language !== sourceLanguage) contextWarnings.push(outputIdentityKey({ kind: "preparation", id: source.id, language: sourceLanguage }))
      dependencies.set(outputIdentityKey(prepStatus.identity), contextWarnings)
      if (options.kinds && !options.kinds.some((kind) => kind === "audio" || kind === "timestamps")) continue
      for (const { voiceSlot, voice } of resolvedVoices) {
        if (!voice) continue
        const prior = audio.find((entry) => entry.textId === source.id && (entry.voiceSlot ?? "primary") === voiceSlot)
        const text = stripEmojis(speechEntries[index].text).trim()
        let speechSignature = computeSpeechCacheKey({ format: resolveSpeechFormat(voice.provider, config.speech?.format), sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate, text, provider: voice.provider, model: voice.model, voice: voice.voice,
          instructions: ["openai", "gemini"].includes(voice.provider) ? resolveInstructions(language, instructions) : "",
          geminiTemperature: config.speech?.temperature, geminiSeed: config.speech?.seed,
          elevenLabsPreviousText: voice.provider === "elevenlabs" && config.speech?.elevenlabs_use_context ? findAdjacentSpeechText(speechEntries, index, -1, config.speech) : undefined,
          elevenLabsNextText: voice.provider === "elevenlabs" && config.speech?.elevenlabs_use_context ? findAdjacentSpeechText(speechEntries, index, 1, config.speech) : undefined,
          elevenLabsApplyTextNormalization: config.speech?.elevenlabs_apply_text_normalization, ...elevenLabsVoiceSettingsFromConfig(config.speech),
        })
        const pageId = pageOf(source)
        if (prior?.pageBatchFallback !== "single-item" && config.speech?.batch_by_page && voice.provider === "gemini" && supportsPageBatchedSpeech(language) && pageId && !source.id.endsWith("_easy_read")) {
          const context = speechEntries.filter((entry) => pageOf(entry) === pageId && !isTtsExcluded(entry.id, config.speech))
          speechSignature = computePageSpeechInputSignature({ entries: context, voice: voice.voice, model: voice.model, instructions: resolveInstructions(language, instructions), provider: voice.provider, geminiTemperature: config.speech?.temperature, geminiSeed: config.speech?.seed })
        }
        let usable = false
        if (prior && path.basename(prior.fileName) === prior.fileName) {
          const file = path.join(bookDir, "audio", language, prior.fileName)
          usable = available(path.relative(bookDir, file)) || available(path.join("audio", language.replace("-", "_"), prior.fileName))
        }
        const audioMetadata = prior ? { ...prior, source: prior.provider === "manual" ? "manual" as const : prior.source,
          input: prior.speechInputSignature ? { signature: prior.speechInputSignature, contentHash: inputSignature(prior.audioHash ?? prior.fileName), references: [] } : prior.input } : undefined
        const audioStatus = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "audio", id: source.id, language, voiceSlot }, signature: speechSignature,
          content: prior?.audioHash ?? prior?.fileName, metadata: audioMetadata, usable, excluded: speechExcluded, upstream: [prepStatus],
        }), source))
        let speechContext = [source.id]
        if (prior?.pageBatchFallback !== "single-item" && config.speech?.batch_by_page && voice.provider === "gemini" && supportsPageBatchedSpeech(language) && pageId && !source.id.endsWith("_easy_read")) {
          speechContext = speechEntries.filter((entry) => pageOf(entry) === pageId && !isTtsExcluded(entry.id, config.speech)).map((entry) => entry.id)
        } else if (voice.provider === "elevenlabs" && config.speech?.elevenlabs_use_context) {
          for (const direction of [-1, 1] as const) {
            const text = findAdjacentSpeechText(speechEntries, index, direction, config.speech)
            for (let candidate = index + direction; text && candidate >= 0 && candidate < speechEntries.length; candidate += direction) {
              if (stripEmojis(speechEntries[candidate].text).trim() === text) { speechContext.push(speechEntries[candidate].id); break }
            }
          }
        }
        dependencies.set(outputIdentityKey(audioStatus.identity), speechContext.map((id) => outputIdentityKey({ kind: "preparation", id, language })))
        if (config.speech?.word_highlighting) {
          const timing = timings?.[voiceSlotEntryId(source.id, voiceSlot)]
          add(withOutputLocations(deriveOutputStatus({ identity: { kind: "timestamps", id: source.id, language, voiceSlot },
            signature: timestampInputSignature(prior?.audioHash ?? prior?.fileName ?? null, language, speechEntries[index].text),
            content: timing ? { words: timing.words, duration: timing.duration } : undefined, metadata: timing,
            usable: usable && !!timing?.words.length && (!timing.audioHash || timing.audioHash === prior?.audioHash),
            excluded: speechExcluded, upstream: [audioStatus],
          }), source))
        }
      }
    }
  }
  // Fixed consumer relationships, not persisted stale flags. Resolve after all
  // neighbors exist so reading order cannot hide a later input's warning.
  for (const kind of ["preparation", "audio", "timestamps"] as const) for (const status of statuses) {
    if (status.identity.kind !== kind || status.excluded) continue
    const keys = kind === "timestamps" ? [outputIdentityKey({ ...status.identity, kind: "audio" })] : dependencies.get(outputIdentityKey(status.identity)) ?? []
    for (const key of keys) {
      const upstream = byKey.get(key)
      if (!upstream || upstream.excluded || upstream.current && !upstream.warnings.length) continue
      if (!upstream.current) status.current = false
      if (!status.warnings.some((warning) => warning.source && outputIdentityKey(warning.source) === key)) status.warnings.push({ reason: "upstream", source: upstream.identity })
    }
  }
  return selected(statuses)
}

export function timestampInputSignature(audioHash: string | null, language: string, text: string): string {
  return inputSignature({ audioHash, language: getBaseLanguage(language), prompt: text, model: "whisper-1" })
}
