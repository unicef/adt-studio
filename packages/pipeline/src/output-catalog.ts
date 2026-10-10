import { retainedCoreTts, retainedEasyRead } from "./retained-catalog.js"
import { supportsPageBatchedSpeech } from "./speech-batch.js"
import fs from "node:fs"
import { createHash } from "node:crypto"
import { buildImageTranslationConfig } from "./image-translation.js"
import path from "node:path"
import type { Storage } from "@adt/storage"
import { createPromptEngine } from "@adt/llm"
import { isTtsExcluded, voiceSlotEntryId, type AppConfig, type TextCatalogEntry, type TextCatalogOutput, type EasyReadOutput, type ImageCaptioningOutput, type TTSOutput, type WordTimestampOutput, type OutputStatus, type OutputMetadata, type TranslatedImageAsset } from "@adt/types"
import { buildTextCatalogSnapshot } from "./text-catalog.js"
import { buildImageInventory } from "./catalog-reconciliation.js"
import { buildCaptionConfig } from "./image-captioning.js"
import { buildCatalogTranslationConfig, getTargetLanguages, translationInputSignature } from "./catalog-translation.js"
import { buildEasyReadConfig, buildEasyReadSourceBlocks, easyReadInputSignature, flattenEasyReadEntries } from "./easy-read.js"
import { buildCoreTtsPreparationConfig, buildCoreTtsSourceContext, resolveCoreTtsSpeechCatalog, coreTtsInputBasis, getCoreTtsCatalog, loadCoreTtsProfiles, resolveCoreTtsProfile } from "./core-tts.js"
import { normalizeLocale, getBaseLanguage } from "./language-context.js"
import { deriveOutputStatus, inputSignature, outputIdentityKey, withOutputLocations } from "./output-freshness.js"
import { speechPageId, isSpeakableText, computePageSpeechInputSignature, computeSpeechCacheKey, loadVoicesConfig, loadSpeechInstructions, resolveSpeechVoice, resolveSpeechFormat, resolveInstructions, stripEmojis, elevenLabsVoiceSettingsFromConfig, findAdjacentSpeechText } from "./speech.js"

export function captionInputSignature(options: { assetHash: string | null; pageImage: string | null; language: string; summary?: string; config: ReturnType<typeof buildCaptionConfig>; prompt: string }): string {
  return inputSignature({ image: options.assetHash, page: options.pageImage, language: options.language,
    summary: options.summary, prompt: options.prompt, model: options.config.modelId,
    userPrompt: options.config.userPrompt, gradeLevel: options.config.gradeLevel })
}

/** Read-only projection. Expected work comes from sources, including inputs for
 * which no successful output exists. The caller owns storage and admission. */
export function readOutputCatalog(options: {
  storage: Storage; config: AppConfig; bookDir: string; promptsDir: string; configDir: string
}): OutputStatus[] {
  const { storage, config, bookDir, promptsDir, configDir } = options
  const sourceLanguage = normalizeLocale(config.editing_language ?? (storage.getLatestNodeData("metadata", "book")?.data as { language_code?: string })?.language_code ?? "en")
  const languages = [...new Set([sourceLanguage, ...(config.output_languages ?? []).map(normalizeLocale)])]
  const engine = createPromptEngine([path.join(bookDir, "prompts"), promptsDir], { basePromptModelId: config.base_prompt_model })
  const prompt = (name: string, model: string) => {
    try { return engine.fingerprint(name, { modelId: model }) }
    catch { return inputSignature({ missingPrompt: name, model }) }
  }
  const dependencies = new Map<string, string[]>()
  const statuses: OutputStatus[] = []
  const byKey = new Map<string, OutputStatus>()
  const add = (status: OutputStatus) => { statuses.push(status); byKey.set(outputIdentityKey(status.identity), status); return status }
  const find = (kind: OutputStatus["identity"]["kind"], id: string, language?: string) => byKey.get(outputIdentityKey({ kind, id, language }))
  const inventory = buildImageInventory(storage)
  const decorativeImages = new Set<string>()
  const captionConfig = buildCaptionConfig(config)
  const summary = (storage.getLatestNodeData("book-summary", "book")?.data as { summary?: string })?.summary
  for (const image of inventory) {
    const previous = image.pageId ? (storage.getLatestNodeData("image-captioning", image.pageId)?.data as ImageCaptioningOutput | undefined)?.captions.find((entry) => entry.imageId === image.id) : undefined
    if (previous?.decorative) decorativeImages.add(image.id)
    let pageImage: string | null = null
    try { if (image.pageId) pageImage = inputSignature(storage.getPageImageBase64(image.pageId)) } catch { /* This input alone is unavailable. */ }
    const status = deriveOutputStatus({ identity: { kind: "caption", id: image.id },
      signature: captionInputSignature({ assetHash: image.assetHash, pageImage, language: sourceLanguage, summary, config: captionConfig, prompt: prompt(captionConfig.promptName, captionConfig.modelId) }),
      content: previous ? { caption: previous.caption, decorative: previous.decorative === true } : undefined,
      metadata: previous, usable: !!previous && (previous.decorative === true || !!previous.caption.trim()),
    })
    add({ ...status, pageIds: image.pageIds, sectionIds: image.sectionIds, group: image.glossary ? "glossary" : undefined })
  }
  const imageConfig = buildImageTranslationConfig(config)
  for (const image of inventory) for (const language of getTargetLanguages(languages, sourceLanguage)) {
    const itemId = `${image.id}_tr_${language}`
    const previous = storage.getLatestNodeData("image-translation", itemId)?.data as TranslatedImageAsset | undefined
    const legacy = storage.getImageMeta(itemId)
    const relativePath = previous?.relativePath ?? legacy?.relativePath
    const hash = previous?.hash ?? (relativePath ? assetContentHash(bookDir, relativePath) ?? undefined : undefined)
    add({ ...deriveOutputStatus({ identity: { kind: "image-translation", id: image.id, language },
      signature: inputSignature({ image: image.assetHash, sourceLanguage, language, model: imageConfig.modelId, prompt: prompt(config.image_translation?.prompt ?? "image_translation", imageConfig.modelId) }),
      content: hash, metadata: previous, usable: !!relativePath && usableAsset(bookDir, relativePath, hash),
      excluded: !imageConfig.enabled || !imageConfig.selectedImageIds.includes(image.id),
    }), pageIds: image.pageIds, sectionIds: image.sectionIds, group: image.glossary ? "glossary" : undefined })
  }
  const snapshot = buildTextCatalogSnapshot(storage, storage.getPages())
  const hasAuthored = storage.getPages().some((page) => storage.getLatestNodeData("web-rendering", page.pageId)) || storage.getLatestNodeData("glossary", "book") || storage.getLatestNodeData("quiz-generation", "book")
  const catalog = hasAuthored ? snapshot : (storage.getLatestNodeData("text-catalog", "book")?.data as TextCatalogOutput | undefined) ?? snapshot
  // Missing captions still imply expected dependent work for actual consumers.
  const sources = [...catalog.entries]
  for (const image of inventory) {
    if (!decorativeImages.has(image.id) && image.catalogLocations.length && !sources.some((entry) => entry.id === image.id)) sources.push({ id: image.id, text: "", locations: image.catalogLocations })
  }
  const easyConfig = buildEasyReadConfig(config, sourceLanguage)
  easyConfig.promptSignature = prompt(easyConfig.promptName, easyConfig.modelId)
  const easy = retainedEasyRead(storage, buildEasyReadSourceBlocks(storage, storage.getPages()))
  const easyById = new Map((easy?.blocks ?? []).flatMap((block) => block.entries.map((entry) => [entry.easyReadId, entry] as const)))
  if (easyConfig.enabled) for (const block of buildEasyReadSourceBlocks(storage, storage.getPages())) for (const entry of block.entries) {
    const previous = easyById.get(entry.easyReadId)
    const source = { id: entry.easyReadId, text: previous?.text ?? "", locations: [{ pageId: entry.pageId, sectionId: entry.sectionId }] }
    sources.push(source)
    add(withOutputLocations(deriveOutputStatus({ identity: { kind: "easy-read", id: entry.easyReadId, language: sourceLanguage },
      signature: easyReadInputSignature(block, entry.sourceId, easyConfig), content: previous?.text, metadata: previous, usable: !!previous?.text.trim(),
    }), source))
  }
  const translationConfig = buildCatalogTranslationConfig(config, sourceLanguage)
  translationConfig.promptSignature = prompt(translationConfig.promptName, translationConfig.modelId)
  const displays = new Map<string, TextCatalogEntry[]>([[sourceLanguage, sources]])
  const sourceStatus = (entry: TextCatalogEntry) => find("caption", entry.id) ?? find("easy-read", entry.id, sourceLanguage)
  for (const language of getTargetLanguages(languages, sourceLanguage)) {
    const prior = ((storage.getLatestNodeData("text-catalog-translation", language) ?? storage.getLatestNodeData("text-catalog-translation", language.replace("-", "_")))?.data as TextCatalogOutput | undefined)?.entries ?? []
    const byId = new Map(prior.map((entry) => [entry.id, entry]))
    const display: TextCatalogEntry[] = []
    for (const source of sources) {
      const previous = byId.get(source.id)
      const upstream = sourceStatus(source)
      add(withOutputLocations(deriveOutputStatus({ identity: { kind: "translation", id: source.id, language },
        signature: translationInputSignature(source, language, translationConfig), content: previous?.text, metadata: previous, usable: !!previous?.text.trim(), upstream: upstream ? [upstream] : [],
      }), source))
      display.push({ ...source, text: previous?.text ?? "" })
    }
    displays.set(language, display)
  }
  const preparation = buildCoreTtsPreparationConfig(config)
  preparation.promptSignature = prompt(preparation.promptName, preparation.modelId)
  const profiles = loadCoreTtsProfiles(configDir)
  const sourceCore = retainedCoreTts(storage, sourceLanguage, sources.map((entry) => entry.id))
  const effectiveSourceCore = resolveCoreTtsSpeechCatalog({ entries: sources, language: sourceLanguage, config: preparation, profile: resolveCoreTtsProfile(sourceLanguage, profiles), previous: sourceCore })
  const sourceContext = buildCoreTtsSourceContext(sources, effectiveSourceCore)
  const voices = loadVoicesConfig(configDir)
  const instructions = loadSpeechInstructions(configDir)
  for (const language of languages) {
    const entries = getBaseLanguage(language) === getBaseLanguage(sourceLanguage) ? sources : displays.get(language) ?? []
    const core = retainedCoreTts(storage, language, entries.map((entry) => entry.id))
    const coreById = new Map((core?.entries ?? []).map((entry) => [entry.id, entry]))
    const audio = ((storage.getLatestNodeData("tts", language) ?? storage.getLatestNodeData("tts", language.replace("-", "_")))?.data as TTSOutput | undefined)?.entries ?? []
    const effectiveCore = resolveCoreTtsSpeechCatalog({ entries, language, config: preparation, profile: resolveCoreTtsProfile(language, profiles), previous: core, sourceContext: language === sourceLanguage ? undefined : sourceContext })
    const effectiveById = new Map(effectiveCore.entries.map((entry) => [entry.id, entry]))
    const pageOf = (entry: TextCatalogEntry) => speechPageId(entry.id, entry.locations?.flatMap((location) => location.pageId ? [location.pageId] : []))
    const speechEntries = entries.map((entry) => ({ ...entry, text: effectiveById.get(entry.id)?.speechText ?? entry.text }))
    for (let index = 0; index < entries.length; index++) {
      const source = entries[index]
      const previous = effectiveById.get(source.id) ?? coreById.get(source.id)
      const { signature, input } = coreTtsInputBasis({ entries, index, language, config: preparation, profile: resolveCoreTtsProfile(language, profiles), sourceContext: language === sourceLanguage ? undefined : sourceContext })
      const upstream = getBaseLanguage(language) === getBaseLanguage(sourceLanguage) ? sourceStatus(source) : find("translation", source.id, language)
      const metadata: OutputMetadata | undefined = previous?.generation.mode === "manual" ? { ...previous, source: "manual" } : previous
      const speechExcluded = isTtsExcluded(source.id, config.speech) || (source.id.endsWith("_easy_read") && !easyConfig.tts) || (!!source.text.trim() && !isSpeakableText(stripEmojis(source.text).trim()))
      const prepStatus = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "preparation", id: source.id, language }, signature,
        content: previous?.speechText, metadata, excluded: speechExcluded, usable: !!previous?.speechText?.trim(), fallback: previous?.fallbackReason, upstream: upstream ? [upstream] : [],
      }), source))
      const contextWarnings = (input.enabled_transformations.length ? entries.slice(Math.max(0, index - 1), index + 2) : [source]).flatMap((entry) => {
        const status = getBaseLanguage(language) === getBaseLanguage(sourceLanguage) ? sourceStatus(entry) : find("translation", entry.id, language)
        return status ? [outputIdentityKey(status.identity)] : []
      })
      if (input.enabled_transformations.length && language !== sourceLanguage) contextWarnings.push(outputIdentityKey({ kind: "preparation", id: source.id, language: sourceLanguage }))
      dependencies.set(outputIdentityKey(prepStatus.identity), contextWarnings)
      for (const voiceSlot of ["primary", "secondary"] as const) {
        const voice = resolveSpeechVoice(language, voiceSlot, config.speech, voices, config.speech?.model ?? config.default_speech_generation_model)
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
        if (config.speech?.batch_by_page && voice.provider === "gemini" && supportsPageBatchedSpeech(language) && pageId && !source.id.endsWith("_easy_read")) {
          const context = speechEntries.filter((entry) => pageOf(entry) === pageId && !isTtsExcluded(entry.id, config.speech))
          speechSignature = computePageSpeechInputSignature({ entries: context, voice: voice.voice, model: voice.model, instructions: resolveInstructions(language, instructions), provider: voice.provider, geminiTemperature: config.speech?.temperature, geminiSeed: config.speech?.seed })
        }
        let usable = false
        let actualAudioHash: string | undefined
        if (prior && path.basename(prior.fileName) === prior.fileName) {
          const file = path.join(bookDir, "audio", language, prior.fileName)
          actualAudioHash = assetContentHash(bookDir, path.relative(bookDir, file)) ?? assetContentHash(bookDir, path.join("audio", language.replace("-", "_"), prior.fileName)) ?? undefined
          usable = !!actualAudioHash && (!prior.audioHash || actualAudioHash === prior.audioHash)
        }
        const audioMetadata = prior ? { ...prior, source: prior.provider === "manual" ? "manual" as const : prior.source,
          input: prior.speechInputSignature ? { signature: prior.speechInputSignature, contentHash: inputSignature(prior.audioHash ?? actualAudioHash ?? prior.fileName), references: [] } : prior.input } : undefined
        const audioStatus = add(withOutputLocations(deriveOutputStatus({ identity: { kind: "audio", id: source.id, language, voiceSlot }, signature: speechSignature,
          content: prior?.audioHash ?? actualAudioHash ?? prior?.fileName, metadata: audioMetadata, usable, excluded: speechExcluded, upstream: [prepStatus],
        }), source))
        let speechContext = [source.id]
        if (config.speech?.batch_by_page && voice.provider === "gemini" && supportsPageBatchedSpeech(language) && pageId && !source.id.endsWith("_easy_read")) {
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
          const timing = ((storage.getLatestNodeData("tts-timestamps", language) ?? storage.getLatestNodeData("tts-timestamps", language.replace("-", "_")))?.data as WordTimestampOutput | undefined)?.entries[voiceSlotEntryId(source.id, voiceSlot)]
          add(withOutputLocations(deriveOutputStatus({ identity: { kind: "timestamps", id: source.id, language, voiceSlot },
            signature: timestampInputSignature(prior?.audioHash ?? actualAudioHash ?? prior?.fileName ?? null, language, speechEntries[index].text),
            content: timing ? { words: timing.words, duration: timing.duration } : undefined, metadata: timing,
            usable: usable && !!timing?.words.length && (!timing.audioHash || timing.audioHash === (prior?.audioHash ?? actualAudioHash)),
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
  return statuses
}

export function timestampInputSignature(audioHash: string | null, language: string, text: string): string {
  return inputSignature({ audioHash, language: getBaseLanguage(language), prompt: text, model: "whisper-1" })
}

/** Read-only physical verification. A path or cached database hash is not proof
 * that the retained bytes are usable. Never follow an asset outside the book. */
function usableAsset(bookDir: string, relativePath: string, hash?: string): boolean {
  const actual = assetContentHash(bookDir, relativePath)
  return !!actual && (!hash || actual.startsWith(hash))
}
function assetContentHash(bookDir: string, relativePath: string): string | null {
  try {
    const root = fs.realpathSync(bookDir)
    const file = fs.realpathSync(path.resolve(root, relativePath))
    const relative = path.relative(root, file)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null
    const bytes = fs.readFileSync(file)
    return bytes.length ? createHash("sha256").update(bytes).digest("hex") : null
  } catch { return null }
}
