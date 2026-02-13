import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, ImageCaptioningOutput } from "@adt/types"
import { imageCaptioningLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"

export interface CaptionPageInput {
  pageId: string
  pageImageBase64: string
  images: { imageId: string; imageBase64: string }[]
  language: string
}

export interface CaptionConfig {
  promptName: string
  modelId: string
}

/**
 * Extract unique image IDs from rendered HTML sections.
 * Parses each section's HTML and finds <img> tags with data-id attributes.
 */
export function extractImageIds(htmlSections: string[]): string[] {
  const ids = new Set<string>()
  for (const html of htmlSections) {
    const doc = parseDocument(html)
    const imgElements = DomUtils.findAll(
      (el) =>
        el.type === "tag" &&
        el.name === "img" &&
        !!el.attribs?.["data-id"],
      doc.children
    )
    for (const el of imgElements) {
      ids.add(el.attribs["data-id"])
    }
  }
  return [...ids]
}

/**
 * Build captioning config from AppConfig with sensible defaults.
 */
export function buildCaptionConfig(appConfig: AppConfig): CaptionConfig {
  return {
    promptName: appConfig.image_captioning?.prompt ?? "image_captioning",
    modelId:
      appConfig.image_captioning?.model ??
      appConfig.text_classification?.model ??
      "openai:gpt-4.1",
  }
}

/**
 * Caption all images on a page in a single LLM call.
 * Pure function — no side effects.
 */
export async function captionPageImages(
  input: CaptionPageInput,
  config: CaptionConfig,
  llmModel: LLMModel
): Promise<ImageCaptioningOutput> {
  if (input.images.length === 0) {
    return { captions: [] }
  }

  const inputImageIds = input.images.map((img) => img.imageId)

  const result = await llmModel.generateObject<{
    captions: Array<{ image_id: string; reasoning: string; caption: string }>
  }>({
    schema: imageCaptioningLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      images: input.images,
      language: input.language,
    },
    validate: (
      raw: unknown
    ): ValidationResult => {
      const r = raw as {
        captions: Array<{ image_id: string; reasoning: string; caption: string }>
      }
      const returnedIds = r.captions.map((c) => c.image_id)
      const missing = inputImageIds.filter((id) => !returnedIds.includes(id))
      const extra = returnedIds.filter((id) => !inputImageIds.includes(id))
      const duplicateIds = [...new Set(
        returnedIds.filter((id, index) => returnedIds.indexOf(id) !== index)
      )]
      const errors: string[] = []
      if (missing.length > 0) {
        errors.push(
          `Missing captions for image IDs: ${missing.join(", ")}. You must provide a caption for every image.`
        )
      }
      if (extra.length > 0) {
        errors.push(
          `Unexpected image IDs: ${extra.join(", ")}. Only caption the images provided.`
        )
      }
      if (duplicateIds.length > 0) {
        errors.push(
          `Duplicate image IDs: ${duplicateIds.join(", ")}. Provide exactly one caption per image.`
        )
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: 2,
    maxTokens: 4096,
    log: {
      taskType: "image-captioning",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  return {
    captions: result.object.captions.map((c) => ({
      imageId: c.image_id,
      reasoning: c.reasoning,
      caption: c.caption,
    })),
  }
}
