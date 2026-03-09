import type { LLMModel } from "@adt/llm"
import { StyleguideGenerationOutput } from "@adt/types"
export type { StyleguideGenerationOutput } from "@adt/types"

export interface StyleguideGenerationInput {
  pageImages: Array<{
    pageId: string
    pageNumber: number
    imageBase64: string
  }>
}

export interface StyleguideGenerationConfig {
  promptName: string
  modelId: string
  maxRetries: number
  temperature?: number
}

export function buildStyleguideGenerationConfig(
  stepConfig?: { prompt?: string; model?: string; max_retries?: number; temperature?: number }
): StyleguideGenerationConfig {
  return {
    promptName: stepConfig?.prompt ?? "styleguide_generation",
    modelId: stepConfig?.model ?? "openai:gpt-5.2",
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
