import { z } from "zod"
import type { TextClassificationOutput, AppConfig } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import {
  buildTranslationLanguageContext,
  getBaseLanguage,
  normalizeLocale,
} from "./language-context.js"

export interface TranslationConfig {
  sourceLanguage: string
  targetLanguage: string
  promptName: string
  modelId: string
}

export { normalizeLocale, getBaseLanguage } from "./language-context.js"

/**
 * Determine whether translation is needed based on source and editing languages.
 * Returns false if either is missing or if the base languages match.
 */
export function shouldTranslate(
  sourceLanguage: string | null,
  editingLanguage?: string
): boolean {
  if (!editingLanguage || !sourceLanguage) return false
  return getBaseLanguage(sourceLanguage) !== getBaseLanguage(editingLanguage)
}

/**
 * Build translation config from AppConfig and detected source language.
 * Returns null if no translation is needed.
 */
export function buildTranslationConfig(
  appConfig: AppConfig,
  sourceLanguage: string | null
): TranslationConfig | null {
  if (!shouldTranslate(sourceLanguage, appConfig.editing_language)) return null
  return {
    sourceLanguage: normalizeLocale(sourceLanguage!),
    targetLanguage: normalizeLocale(appConfig.editing_language!),
    promptName: appConfig.translation?.prompt ?? "translation",
    modelId:
      appConfig.translation?.model ??
      appConfig.text_classification?.model ??
      "openai:gpt-4.1",
  }
}

const translationSchema = z.object({
  translations: z.array(z.string()),
})

/**
 * Translate all text entries in a TextClassificationOutput.
 * Preserves structure (groupId, groupType, textType, isPruned) — only text content changes.
 * Returns a new TextClassificationOutput suitable for saving as a new version.
 */
export async function translatePageText(
  pageId: string,
  textClassification: TextClassificationOutput,
  config: TranslationConfig,
  llmModel: LLMModel
): Promise<TextClassificationOutput> {
  // Collect all texts in order
  const texts: Array<{ index: number; text: string }> = []
  for (const group of textClassification.groups) {
    for (const entry of group.texts) {
      texts.push({ index: texts.length, text: entry.text })
    }
  }

  if (texts.length === 0) return textClassification

  const result = await llmModel.generateObject<{
    translations: string[]
  }>({
    schema: translationSchema,
    prompt: config.promptName,
    context: {
      ...buildTranslationLanguageContext(config.sourceLanguage, config.targetLanguage),
      texts,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as { translations: string[] }
      if (r.translations.length !== texts.length) {
        return {
          valid: false,
          errors: [
            `Expected ${texts.length} translations but got ${r.translations.length}. You must return exactly one translation for each input text, in the same order.`,
          ],
        }
      }
      return { valid: true, errors: [] }
    },
    maxRetries: 2,
    maxTokens: 16384,
    log: {
      taskType: "translation",
      pageId,
      promptName: config.promptName,
    },
  })

  // Reconstruct with translated texts
  let textIndex = 0
  const translatedGroups = textClassification.groups.map((group) => ({
    ...group,
    texts: group.texts.map((entry) => ({
      ...entry,
      text: result.object.translations[textIndex++],
    })),
  }))

  return {
    reasoning: `Translated from ${config.sourceLanguage} to ${config.targetLanguage}. Original reasoning: ${textClassification.reasoning}`,
    groups: translatedGroups,
  }
}
