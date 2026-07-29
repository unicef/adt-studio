import { z } from "zod"
import type { AppConfig, PageSectioningOutput } from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import {
  buildTranslationLanguageContext,
  getBaseLanguage,
  normalizeLocale,
} from "./language-context.js"
import { countLeafTexts, mapLeafTexts } from "./page-sectioning.js"

export interface TranslationConfig {
  sourceLanguage: string
  targetLanguage: string
  promptName: string
  modelId: string
  maxRetries: number
}

export { normalizeLocale, getBaseLanguage } from "./language-context.js"

export function shouldTranslate(
  sourceLanguage: string | null,
  editingLanguage?: string
): boolean {
  if (!editingLanguage || !sourceLanguage) return false
  return getBaseLanguage(sourceLanguage) !== getBaseLanguage(editingLanguage)
}

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
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      "openai:gpt-4.1",
    maxRetries: appConfig.translation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
  }
}

const translationSchema = z.object({
  translations: z.array(z.string()),
})

/**
 * Translate all leaf text in a PageSectioningOutput. Preserves tree
 * structure (nodeId, sectionId, structure, role, isPruned, imageId) —
 * only leaf `text` values are replaced. Returns a new output suitable
 * for storing as a new version under the `page-sectioning` node.
 */
export async function translatePageTree(
  pageId: string,
  sectioning: PageSectioningOutput,
  config: TranslationConfig,
  llmModel: LLMModel
): Promise<PageSectioningOutput> {
  const totalTexts = countLeafTexts(sectioning)
  if (totalTexts === 0) return sectioning

  const texts: Array<{ index: number; text: string }> = []
  mapLeafTexts(sectioning, (text, index) => {
    texts.push({ index, text })
    return text
  })

  const result = await llmModel.generateObject<{ translations: string[] }>({
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
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    log: {
      taskType: "translation",
      pageId,
      promptName: config.promptName,
    },
  })

  const translated = mapLeafTexts(
    sectioning,
    (_text, index) => result.object.translations[index] ?? ""
  )

  return {
    reasoning: `Translated from ${config.sourceLanguage} to ${config.targetLanguage}. Original reasoning: ${sectioning.reasoning}`,
    sections: translated.sections,
  }
}
