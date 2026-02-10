import { BookMetadata, type AppConfig } from "@adt/types"
import type { LLMModel } from "@adt/llm"

export interface MetadataConfig {
  promptName: string
  modelId: string
}

export interface MetadataPageInput {
  pageNumber: number
  text: string
  imageBase64: string
}

/**
 * Extract book metadata from the first few pages using an LLM.
 * Pure async function — no side effects.
 */
export async function extractMetadata(
  pages: MetadataPageInput[],
  config: MetadataConfig,
  llmModel: LLMModel
): Promise<BookMetadata> {
  if (pages.length === 0) {
    throw new Error("No pages provided for metadata extraction")
  }

  const result = await llmModel.generateObject<BookMetadata>({
    schema: BookMetadata,
    prompt: config.promptName,
    context: {
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        imageBase64: p.imageBase64,
      })),
    },
    maxRetries: 2,
    maxTokens: 4096,
    log: {
      taskType: "metadata",
      promptName: config.promptName,
    },
  })

  return result.object
}

/**
 * Build MetadataConfig from AppConfig.
 */
export function buildMetadataConfig(appConfig: AppConfig): MetadataConfig {
  return {
    promptName: appConfig.metadata?.prompt ?? "metadata_extraction",
    modelId: appConfig.metadata?.model ?? "openai:gpt-4o",
  }
}
