import { BookSummaryOutput, type AppConfig } from "@adt/types"
import type { LLMModel } from "@adt/llm"
import { buildLanguageContext, normalizeLocale } from "./language-context.js"

export interface BookSummaryConfig {
  promptName: string
  modelId: string
  outputLanguage: string
}

export interface BookSummaryPageInput {
  pageNumber: number
  text: string
}

/**
 * Generate a brief narrative summary of a book from its page text.
 * Pure async function — no side effects.
 */
export async function generateBookSummary(
  pages: BookSummaryPageInput[],
  config: BookSummaryConfig,
  llmModel: LLMModel
): Promise<BookSummaryOutput> {
  if (pages.length === 0) {
    throw new Error("No pages provided for book summary")
  }

  const outputLanguage = buildLanguageContext(config.outputLanguage)
  const result = await llmModel.generateObject<BookSummaryOutput>({
    schema: BookSummaryOutput,
    prompt: config.promptName,
    context: {
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
      })),
      output_language_code: outputLanguage.language_code,
      output_language: outputLanguage.language,
    },
    maxRetries: 2,
    maxTokens: 1024,
    log: {
      taskType: "book-summary",
      promptName: config.promptName,
    },
  })

  return result.object
}

/**
 * Build BookSummaryConfig from AppConfig.
 */
export function buildBookSummaryConfig(appConfig: AppConfig): BookSummaryConfig {
  return {
    promptName: appConfig.book_summary?.prompt ?? "book_summary",
    modelId: appConfig.book_summary?.model ?? "openai:gpt-5.2",
    outputLanguage: normalizeLocale(appConfig.editing_language ?? "en"),
  }
}
