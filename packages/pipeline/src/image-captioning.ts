import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, GlossaryOutput, ImageCaptioningOutput } from "@adt/types"
import {
  imageCaptioningLLMSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { buildLanguageContext } from "./language-context.js"

export interface CaptionPageInput {
  pageId: string
  pageImageBase64: string
  images: { imageId: string; imageBase64: string; width?: number; height?: number }[]
  language: string
  bookSummary?: string
}

export interface CaptionConfig {
  promptName: string
  modelId: string
  maxRetries: number
  userPrompt?: string
  gradeLevel?: "early" | "middle" | "advanced"
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
 * Collect the images that should be captioned for a page. Glossary images may
 * not appear in rendered page HTML, so callers can include their IDs here.
 */
export function collectCaptionImageIds(
  htmlSections: string[],
  additionalImageIds: readonly string[] = []
): string[] {
  const ids = new Set(extractImageIds(htmlSections))
  for (const imageId of additionalImageIds) {
    ids.add(imageId)
  }
  return [...ids]
}

/**
 * Group active glossary image assignments by the page that owns each image.
 * The page lookup is supplied by the caller so this stays independent of storage.
 */
export function groupGlossaryImageIdsByPage(
  glossary: GlossaryOutput | undefined,
  getImagePageId: (imageId: string) => string | undefined
): Map<string, string[]> {
  const imageIdsByPage = new Map<string, string[]>()
  const seenImageIds = new Set<string>()
  for (const item of glossary?.items ?? []) {
    if (item.pruned || !item.imageId || seenImageIds.has(item.imageId)) continue
    seenImageIds.add(item.imageId)
    const pageId = getImagePageId(item.imageId)
    if (!pageId) continue
    const imageIds = imageIdsByPage.get(pageId) ?? []
    imageIds.push(item.imageId)
    imageIdsByPage.set(pageId, imageIds)
  }
  return imageIdsByPage
}

/**
 * Build captioning config from AppConfig with sensible defaults.
 */
export function buildCaptionConfig(appConfig: AppConfig): CaptionConfig {
  return {
    promptName: appConfig.image_captioning?.prompt ?? "image_captioning",
    modelId:
      appConfig.image_captioning?.model ??
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      "openai:gpt-4.1",
    maxRetries:
      appConfig.image_captioning?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    userPrompt: appConfig.image_captioning_user_prompt || undefined,
    gradeLevel: appConfig.image_captioning_grade_level,
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
  const inputImagesById = new Map(input.images.map((img) => [img.imageId, img]))
  const languageContext = buildLanguageContext(input.language)

  const result = await llmModel.generateObject<{
    captions: Array<{ image_id: string; reasoning: string; caption: string; decorative?: boolean }>
  }>({
    schema: imageCaptioningLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      images: input.images,
      ...languageContext,
      ...(input.bookSummary ? { book_summary: input.bookSummary } : {}),
      user_instructions: config.userPrompt ?? "",
      grade_level: config.gradeLevel ?? "",
    },
    validate: (
      raw: unknown
    ): ValidationResult => {
      const r = raw as {
        captions: Array<{ image_id: string; reasoning: string; caption: string; decorative?: boolean }>
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
      for (const caption of r.captions) {
        const image = inputImagesById.get(caption.image_id)
        const isLargeSelectedImage =
          image?.width !== undefined &&
          image?.height !== undefined &&
          image.width >= 256 &&
          image.height >= 256
        if (!caption.decorative && !caption.caption.trim()) {
          errors.push(
            `Image ${caption.image_id} is not decorative and requires a non-empty caption.`
          )
        }
        // Large images selected into the educational page layout are content
        // by default. This conservative backstop prevents local vision models
        // from hiding a full-page illustration after a weak visual read.
        if (
          caption.decorative &&
          isLargeSelectedImage
        ) {
          errors.push(
            `Image ${caption.image_id} is ${image.width}x${image.height} and must be treated as meaningful content with a caption.`
          )
        }
        if (
          isLargeSelectedImage
          && /distort|pixelat|corrupt|technical error|not recogniz|no discernible|no visual information/i.test(
            `${caption.reasoning} ${caption.caption}`,
          )
        ) {
          errors.push(
            `Image ${caption.image_id} appears unreadable to the model. Reinspect the supplied image before captioning it.`,
          )
        }
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
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
      // Decorative images need no caption — drop any text the model emitted.
      caption: c.decorative ? "" : c.caption,
      ...(c.decorative ? { decorative: true } : {}),
    })),
  }
}
