import type { AppConfig, ImageClassificationOutput } from "@adt/types"
import {
  imageMeaningfulnessLLMSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"

export interface MeaningfulnessPageInput {
  pageId: string
  pageImageBase64: string
  images: { imageId: string; imageBase64: string; width: number; height: number }[]
}

export interface MeaningfulnessConfig {
  promptName: string
  modelId: string
  maxRetries: number
}

/**
 * Build meaningfulness config from AppConfig.
 * Returns null when disabled via image_filters.meaningfulness === false or no model set.
 */
export function buildMeaningfulnessConfig(
  appConfig: AppConfig
): MeaningfulnessConfig | null {
  if (appConfig.image_filters?.meaningfulness === false) return null

  const explicitModel = appConfig.image_meaningfulness?.model
  const model = explicitModel ?? appConfig.default_model
  if (!model) return null
  // Embedded multimodal models can occasionally echo the schema for this
  // optional refinement. Preserve the deterministic filter result by default;
  // an advanced config can opt in explicitly.
  if (
    model.startsWith("local:") &&
    !explicitModel
  ) return null

  return {
    promptName: appConfig.image_meaningfulness?.prompt ?? "image_meaningfulness",
    modelId: model,
    maxRetries:
      appConfig.image_meaningfulness?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
  }
}

/**
 * Filter non-meaningful images on a page via LLM.
 * Takes the programmatic classification output and the unpruned images,
 * returns updated classification with non-meaningful images marked as pruned.
 *
 * Pure function — no side effects.
 */
export async function filterPageImageMeaningfulness(
  input: MeaningfulnessPageInput,
  existingClassification: ImageClassificationOutput,
  config: MeaningfulnessConfig,
  llmModel: LLMModel
): Promise<ImageClassificationOutput> {
  if (input.images.length === 0) {
    return existingClassification
  }

  const inputImageIds = input.images.map((img) => img.imageId)

  const result = await llmModel.generateObject<{
    images: Array<{ image_id: string; reasoning: string; is_meaningful: boolean }>
  }>({
    schema: imageMeaningfulnessLLMSchema,
    // This schema is non-recursive, so llama.cpp can constrain generation
    // directly instead of asking Gemma to reproduce it from prompt text.
    mode: "auto",
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      images: input.images,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as {
        images: Array<{ image_id: string; reasoning: string; is_meaningful: boolean }>
      }
      const returnedIds = r.images.map((i) => i.image_id)
      const missing = inputImageIds.filter((id) => !returnedIds.includes(id))
      const extra = returnedIds.filter((id) => !inputImageIds.includes(id))
      const errors: string[] = []
      if (missing.length > 0) {
        errors.push(
          `Missing results for image IDs: ${missing.join(", ")}. You must evaluate every image.`
        )
      }
      if (extra.length > 0) {
        errors.push(
          `Unexpected image IDs: ${extra.join(", ")}. Only evaluate the images provided.`
        )
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    // This response is a short bounded array. Scale the ceiling with the
    // expected objects so malformed local schema echoes fail fast.
    maxTokens: Math.min(1024, Math.max(256, input.images.length * 192)),
    log: {
      taskType: "image-meaningfulness",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  // Build lookup maps from LLM results
  const nonMeaningfulIds = new Set(
    result.object.images
      .filter((i) => !i.is_meaningful)
      .map((i) => i.image_id)
  )
  const reasoningMap = new Map(
    result.object.images.map((i) => [i.image_id, i.reasoning])
  )

  return {
    images: existingClassification.images.map((img) => {
      if (img.isPruned) return img

      if (nonMeaningfulIds.has(img.imageId)) {
        return {
          imageId: img.imageId,
          isPruned: true,
          reason: `not meaningful: ${reasoningMap.get(img.imageId) ?? "LLM filter"}`,
        }
      }

      return img
    }),
  }
}
