import { z } from "zod"
import type { AppConfig, TextCatalogEntry, TextCatalogOutput } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { getBaseLanguage } from "./translation.js"

export interface CatalogTranslationConfig {
  sourceLanguage: string
  promptName: string
  modelId: string
  batchSize: number
}

export function buildCatalogTranslationConfig(
  appConfig: AppConfig,
  sourceLanguage: string
): CatalogTranslationConfig {
  return {
    sourceLanguage,
    promptName: appConfig.translation?.prompt ?? "translation",
    modelId:
      appConfig.translation?.model ??
      appConfig.text_classification?.model ??
      "openai:gpt-4.1",
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

  const texts = entries.map((e, i) => ({ index: i, text: e.text }))

  const result = await llmModel.generateObject<{
    translations: string[]
  }>({
    schema: translationSchema,
    prompt: config.promptName,
    context: {
      source_language: config.sourceLanguage,
      target_language: targetLanguage,
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
    maxRetries: 2,
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
