import { buildOutputSources, translatedDisplayEntries } from "./output-sources.js"
import { retainedCoreTts } from "./retained-catalog.js"
import { createPromptEngine } from "@adt/llm"
import path from "node:path"
import type { Storage } from "@adt/storage"
import type { AppConfig } from "@adt/types"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import { inputSignature } from "./output-freshness.js"
import {
  buildCoreTtsPreparationConfig, buildCoreTtsSourceContext, getCoreTtsCatalog,
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
  promptsDir?: string
  bookDir?: string
  persist?: boolean
}) {
  const { storage } = options
  const sourceLanguage = normalizeLocale(options.sourceLanguage)
  const sourceEntries = buildOutputSources(storage, options.config).entries
  const config = { ...buildCoreTtsPreparationConfig(options.config), promptSignature: options.promptSignature }
  if (options.promptsDir && options.bookDir) {
    const engine = createPromptEngine([path.join(options.bookDir, "prompts"), options.promptsDir], { basePromptModelId: options.config.base_prompt_model })
    try { config.promptSignature = engine.fingerprint(config.promptName, { modelId: config.modelId }) }
    catch { config.promptSignature = inputSignature({ missingPrompt: config.promptName, model: config.modelId }) }
  }
  const sourceCatalog = resolveCoreTtsSpeechCatalog({
    entries: sourceEntries, language: sourceLanguage, config,
    profile: resolveCoreTtsProfile(sourceLanguage, options.profiles), previous: retainedCoreTts(storage, sourceLanguage, sourceEntries.map((entry) => entry.id)),
  })
  const sourceContext = buildCoreTtsSourceContext(sourceEntries, sourceCatalog)
  return options.languages.map((requested) => {
    const language = normalizeLocale(requested)
    const display = getBaseLanguage(language) === getBaseLanguage(sourceLanguage) ? sourceEntries : translatedDisplayEntries(storage, language, sourceEntries)
    const previous = retainedCoreTts(storage, language, display.map((entry) => entry.id))
    const resolved = language === sourceLanguage ? sourceCatalog : resolveCoreTtsSpeechCatalog({
      entries: display, language, config, profile: resolveCoreTtsProfile(language, options.profiles), previous, sourceContext,
    })
    if (options.persist !== false && inputSignature(getCoreTtsCatalog(storage, language)?.entries) !== inputSignature(resolved.entries)) {
      storage.putNodeData("core-tts-catalog", language, resolved)
    }
    return resolved
  })
}
