import {
  BookMetadata,
  type AppConfig,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL_ID,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"

const ENGLISH_FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "he", "in", "is", "it", "of", "on", "or", "that", "the", "their", "there",
  "they", "this", "to", "was", "were", "will", "with", "you",
])

function hasStrongEnglishSignal(pages: MetadataPageInput[]): boolean {
  const words = pages.flatMap((page) => page.text.toLowerCase().match(/[a-z]+/g) ?? [])
  if (words.length < 30) return false
  const matches = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word))
  return matches.length >= 12 && matches.length / words.length >= 0.12
}

export interface MetadataConfig {
  promptName: string
  modelId: string
  maxRetries: number
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
    validate: (raw) => {
      const metadata = raw as BookMetadata
      if (
        hasStrongEnglishSignal(pages)
        && metadata.language_code
        && metadata.language_code.toLowerCase().split(/[-_]/)[0] !== "en"
      ) {
        return {
          valid: false,
          errors: [
            `The extracted narrative text is clearly English, but language_code was ${metadata.language_code}. Return language_code "en" and do not infer language from the publisher's country.`,
          ],
        }
      }
      return { valid: true, errors: [] }
    },
    maxRetries: config.maxRetries,
    maxTokens: 4096,
    log: {
      taskType: "metadata",
      promptName: config.promptName,
    },
  })

  return {
    ...result.object,
    authors: result.object.authors.filter(
      (author) => !/^(?:null|none|unknown|n\/?a)$/i.test(author.trim()),
    ),
  }
}

/**
 * Build MetadataConfig from AppConfig.
 */
export function buildMetadataConfig(appConfig: AppConfig): MetadataConfig {
  return {
    promptName: appConfig.metadata?.prompt ?? "metadata_extraction",
    modelId: appConfig.metadata?.model ?? appConfig.default_model ?? DEFAULT_LLM_MODEL_ID,
    maxRetries: appConfig.metadata?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
  }
}
