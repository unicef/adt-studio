import type { OutputReference } from "@adt/types"
import { outputSkipped } from "./output-freshness.js"
import { z } from "zod"
import type { AppConfig, TextCatalogEntry, TextCatalogOutput, OutputRunScope } from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import {
  buildTranslationLanguageContext,
  getBaseLanguage,
  normalizeLocale,
} from "./language-context.js"

import { inputSignature, outputEvidence, deriveOutputStatus, withOutputLocations, selectedForGeneration } from "./output-freshness.js"

export interface CatalogTranslationConfig {
  promptSignature?: string
  sourceLanguage: string
  promptName: string
  modelId: string
  maxRetries: number
  batchSize: number
}

export function buildCatalogTranslationConfig(
  appConfig: AppConfig,
  sourceLanguage: string
): CatalogTranslationConfig {
  return {
    sourceLanguage: normalizeLocale(sourceLanguage),
    promptName: appConfig.translation?.prompt ?? "translation",
    modelId:
      appConfig.translation?.model ??
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      "openai:gpt-4.1",
    maxRetries: appConfig.translation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    batchSize: 50,
  }
}

/**
 * Filter output languages to only those that differ from the source language.
 */
export function getTargetLanguages(
  outputLanguages: string[] | undefined,
  sourceLanguage: string
): string[] {
  if (!outputLanguages || outputLanguages.length === 0) return []
  const sourceBase = getBaseLanguage(sourceLanguage)
  return outputLanguages.filter(
    (lang) => getBaseLanguage(lang) !== sourceBase
  )
}

const translationSchema = z.object({
  translations: z.array(z.string()),
})

function isTranslationCountMismatchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /Expected \d+ translations but got \d+/i.test(message)
}

async function translateCatalogBatchOnce(
  entries: TextCatalogEntry[],
  targetLanguage: string,
  config: CatalogTranslationConfig,
  llmModel: LLMModel
): Promise<TextCatalogEntry[]> {
  const texts = entries.map((e, i) => ({ index: i, text: e.text }))
  const normalizedTargetLanguage = normalizeLocale(targetLanguage)

  const result = await llmModel.generateObject<{
    translations: string[]
  }>({
    schema: translationSchema,
    prompt: config.promptName,
    context: {
      ...buildTranslationLanguageContext(
        config.sourceLanguage,
        normalizedTargetLanguage
      ),
      texts,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as { translations: string[] }
      if (r.translations.length !== entries.length) {
        return {
          valid: false,
          errors: [
            `Expected ${entries.length} translations but got ${r.translations.length}. You must return exactly one translation for each input text, in the same order.`,
          ],
        }
      }
      return { valid: true, errors: [] }
    },
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    log: {
      taskType: "catalog-translation",
      promptName: config.promptName,
    },
  })

  return entries.map((entry, i) => ({
    id: entry.id,
    text: result.object.translations[i],
  }))
}

/**
 * Translate a single batch of catalog entries to a target language.
 * Returns the entries with same IDs and translated text.
 */
export async function translateCatalogBatch(
  entries: TextCatalogEntry[],
  targetLanguage: string,
  config: CatalogTranslationConfig,
  llmModel: LLMModel
): Promise<TextCatalogEntry[]> {
  if (entries.length === 0) return []

  try {
    return await translateCatalogBatchOnce(
      entries,
      targetLanguage,
      config,
      llmModel
    )
  } catch (err) {
    if (entries.length <= 1 || !isTranslationCountMismatchError(err)) {
      throw err
    }

    const midpoint = Math.ceil(entries.length / 2)
    const first = await translateCatalogBatch(
      entries.slice(0, midpoint),
      targetLanguage,
      config,
      llmModel
    )
    const second = await translateCatalogBatch(
      entries.slice(midpoint),
      targetLanguage,
      config,
      llmModel
    )
    return [...first, ...second]
  }
}

/** Translation batching is a transport boundary, not semantic context. */
export function translationInputSignature(entry: TextCatalogEntry, targetLanguage: string, config: CatalogTranslationConfig): string {
  return inputSignature({ text: entry.text, sourceLanguage: config.sourceLanguage,
    targetLanguage: normalizeLocale(targetLanguage), model: config.modelId,
    prompt: config.promptSignature ?? config.promptName })
}

export async function translateCatalog(options: {
  entries: TextCatalogEntry[]
  previous?: TextCatalogOutput
  language: string
  config: CatalogTranslationConfig
  llmModel: LLMModel
  scope?: OutputRunScope
  excluded?: ReadonlySet<string>
  signal?: AbortSignal
  references?: OutputReference[]
}): Promise<TextCatalogOutput> {
  const { entries, config, language, llmModel } = options
  const previous = new Map((options.previous?.entries ?? []).map((entry) => [entry.id, entry]))
  const pending = entries.filter((entry) => {
    if (!entry.text.trim()) return false
    const prior = previous.get(entry.id)
    const status = withOutputLocations(deriveOutputStatus({
      identity: { kind: "translation", id: entry.id, language },
      signature: translationInputSignature(entry, language, config), content: prior?.text,
      metadata: prior, usable: !!prior?.text.trim(), excluded: options.excluded?.has(entry.id),
    }), entry)
    return selectedForGeneration(status, prior, options.scope)
  })
  const generated = new Map<string, TextCatalogEntry>()
  for (let offset = 0; offset < pending.length; offset += config.batchSize) {
    options.signal?.throwIfAborted()
    const batch = pending.slice(offset, offset + config.batchSize).filter((entry) => !outputSkipped(options.scope, { kind: "translation", id: entry.id, language }))
    if (!batch.length) continue
    const translated = await translateCatalogBatch(batch, language, config, llmModel)
    options.signal?.throwIfAborted()
    for (const entry of translated) {
      if (outputSkipped(options.scope, { kind: "translation", id: entry.id, language })) continue
      const source = batch.find((item) => item.id === entry.id)!
      generated.set(entry.id, { ...entry, locations: source.locations, source: "ai", input: outputEvidence(translationInputSignature(source, language, config), entry.text, options.references) })
    }
  }
  if (!generated.size) return options.previous ?? { entries: [], generatedAt: new Date().toISOString() }
  // Keep retired/unselected entries available for reactivation and history.
  const merged = new Map(previous)
  for (const [id, entry] of generated) merged.set(id, entry)
  return { entries: [...merged.values()], generatedAt: new Date().toISOString() }
}
