import { buildImageInventory } from "./catalog-reconciliation.js"
import { retainedCoreTts, retainedEasyRead } from "./retained-catalog.js"
import { createPromptEngine, promptRoots } from "@adt/llm"
import path from "node:path"
import { ExtractionAdmissionError, type Storage } from "@adt/storage"
import { isTtsExcluded, type AppConfig, type EasyReadOutput, type ImageCaptioningOutput, type TextCatalogOutput } from "@adt/types"
import { isSpeakableText, stripEmojis } from "./speech.js"
import { buildTextCatalogSnapshot } from "./text-catalog.js"
import { flattenEasyReadEntries, buildEasyReadSourceBlocks } from "./easy-read.js"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import { inputSignature } from "./output-freshness.js"
import {
  buildCoreTtsPreparationConfig, buildCoreTtsSourceContext, coreTtsInputBasis, getCoreTtsCatalog,
  resolveCoreTtsProfile, resolveCoreTtsSpeechCatalog, type CoreTtsProfiles,
} from "./core-tts.js"

/** Shared API/CLI speech admission. Resolves actual requested-language display
 * text without launching Translate, then declares deterministic fallback. */
export function reconcileSpeechInputs(options: {
  storage: Storage
  config: AppConfig
  sourceLanguage: string
  languages: string[]
  profiles: CoreTtsProfiles
  promptSignature?: string
  promptOverridesDir?: string; promptsDir?: string
  bookDir?: string
  persist?: boolean
}) {
  const { storage } = options
  const sourceLanguage = normalizeLocale(options.sourceLanguage)
  const catalog = buildTextCatalogSnapshot(storage, storage.getPages())
  // A stored source catalog is accepted only for older books without authored
  // source records; a present but empty authored snapshot means retired text.
  const hasAuthored = storage.getPages().some((page) => storage.getLatestNodeData("web-rendering", page.pageId)) ||
    storage.getLatestNodeData("glossary", "book") || storage.getLatestNodeData("quiz-generation", "book")
  const source = !hasAuthored ? (storage.getLatestNodeData("text-catalog", "book")?.data as TextCatalogOutput | undefined) ?? catalog : catalog
  const easyRead = retainedEasyRead(storage, buildEasyReadSourceBlocks(storage, storage.getPages()))
  const sourceEntries = [...source.entries]
  for (const image of buildImageInventory(storage)) {
    const caption = image.pageId ? (storage.getLatestNodeData("image-captioning", image.pageId)?.data as ImageCaptioningOutput | undefined)?.captions.find((entry) => entry.imageId === image.id) : undefined
    if (!caption?.decorative && image.catalogLocations.length && !sourceEntries.some((entry) => entry.id === image.id)) sourceEntries.push({ id: image.id, text: "", locations: image.catalogLocations })
  }
  if (options.config.easy_read?.enabled) {
    const existing = new Map(flattenEasyReadEntries(easyRead).map((entry) => [entry.id, entry]))
    for (const block of buildEasyReadSourceBlocks(storage, storage.getPages())) for (const entry of block.entries) sourceEntries.push({ id: entry.easyReadId, text: existing.get(entry.easyReadId)?.text ?? "", locations: [{ pageId: entry.pageId, sectionId: entry.sectionId }] })
  }
  const config = { ...buildCoreTtsPreparationConfig(options.config), promptSignature: options.promptSignature }
  let unsupportedDependencies = false
  if (options.promptsDir && options.bookDir) {
    const engine = createPromptEngine(promptRoots(path.dirname(options.bookDir), options.promptsDir, options.promptOverridesDir, path.join(options.bookDir, "prompts")), { basePromptModelId: options.config.base_prompt_model })
    try { config.promptSignature = engine.fingerprint(config.promptName, { modelId: config.modelId }) }
    catch (error) {
      if (error instanceof Error && error.message.includes("Dynamic prompt includes")) unsupportedDependencies = true
      config.promptSignature = inputSignature({ missingPrompt: config.promptName, model: config.modelId })
    }
  }
  const sourceCatalog = resolveCoreTtsSpeechCatalog({
    entries: sourceEntries, language: sourceLanguage, config,
    profile: resolveCoreTtsProfile(sourceLanguage, options.profiles), previous: retainedCoreTts(storage, sourceLanguage, sourceEntries.map((entry) => entry.id)),
  })
  const sourceContext = buildCoreTtsSourceContext(sourceEntries, sourceCatalog)
  const catalogs = options.languages.map((requested) => {
    const language = normalizeLocale(requested)
    const translated = storage.getLatestNodeData("text-catalog-translation", language) ??
      storage.getLatestNodeData("text-catalog-translation", language.replace("-", "_"))
    const translatedById = new Map(((translated?.data as TextCatalogOutput | undefined)?.entries ?? []).map((entry) => [entry.id, entry]))
    const display = getBaseLanguage(language) === getBaseLanguage(sourceLanguage) ? sourceEntries :
      sourceEntries.map((entry) => ({ ...entry, text: translatedById.get(entry.id)?.text ?? "" }))
    if (unsupportedDependencies && display.some((entry, index) => !isTtsExcluded(entry.id, options.config.speech)
      && !(entry.id.endsWith("_easy_read") && !options.config.easy_read?.tts)
      && !(entry.text.trim() && !isSpeakableText(stripEmojis(entry.text).trim()))
      && coreTtsInputBasis({
      entries: display, index, language, config, profile: resolveCoreTtsProfile(language, options.profiles), sourceContext: language === sourceLanguage ? undefined : sourceContext,
    }).input.enabled_transformations.length > 0)) throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE")
    const previous = retainedCoreTts(storage, language, display.map((entry) => entry.id))
    const resolved = language === sourceLanguage ? sourceCatalog : resolveCoreTtsSpeechCatalog({
      entries: display, language, config, profile: resolveCoreTtsProfile(language, options.profiles), previous, sourceContext,
    })
    return resolved
  })
  for (const catalog of catalogs) if (options.persist !== false && inputSignature(getCoreTtsCatalog(storage, catalog.language)?.entries) !== inputSignature(catalog.entries)) {
    storage.putNodeData("core-tts-catalog", catalog.language, catalog)
  }
  return catalogs
}
