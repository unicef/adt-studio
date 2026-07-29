import type { LLMModel } from "@adt/llm"
import { DEFAULT_LLM_MODEL_ID, StyleguideGenerationOutput, type BookTypography } from "@adt/types"
import type { BookFontPromptEntry } from "./fonts-bundle.js"
export type { StyleguideGenerationOutput } from "@adt/types"

export interface StyleguideGenerationInput {
  pageImages: Array<{
    pageId: string
    pageNumber: number
    imageBase64: string
  }>
  bookFonts?: BookFontPromptEntry[]
  /** Book typography — folded into the Text Styles table so the styleguide maps
   *  each role to the fixed size class rather than choosing sizes itself. */
  typography?: BookTypography
}

export interface StyleguideGenerationConfig {
  promptName: string
  modelId: string
  maxRetries: number
  temperature?: number
}

export function buildStyleguideGenerationConfig(
  stepConfig?: { prompt?: string; model?: string; max_retries?: number; temperature?: number },
  defaultModelId = DEFAULT_LLM_MODEL_ID,
): StyleguideGenerationConfig {
  return {
    promptName: stepConfig?.prompt ?? "styleguide_generation",
    modelId: stepConfig?.model ?? defaultModelId,
    maxRetries: stepConfig?.max_retries ?? 3,
    temperature: stepConfig?.temperature,
  }
}

/**
 * Generate a styleguide markdown document and preview HTML from page images.
 * Pure function — takes images and config, returns generated content.
 */
export async function generateStyleguide(
  input: StyleguideGenerationInput,
  config: StyleguideGenerationConfig,
  llmModel: LLMModel
): Promise<StyleguideGenerationOutput> {
  const context = {
    page_images: input.pageImages.map((p) => ({
      page_id: p.pageId,
      page_number: p.pageNumber,
      image_base64: p.imageBase64,
    })),
    book_fonts: input.bookFonts ?? [],
    typography: input.typography?.styles ?? [],
  }

  const result = await llmModel.generateObject<StyleguideGenerationOutput>({
    schema: StyleguideGenerationOutput,
    prompt: config.promptName,
    context,
    maxRetries: config.maxRetries,
    maxTokens: 32768,
    temperature: config.temperature,
    timeoutMs: 180_000,
    log: {
      taskType: "styleguide-generation",
      promptName: config.promptName,
    },
  })

  return result.object
}
