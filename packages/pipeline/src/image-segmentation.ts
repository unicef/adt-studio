import type { AppConfig, ImageSegmentationOutput } from "@adt/types"
import { imageSegmentationLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { applyCrop } from "./image-cropping.js"

export interface SegmentationPageInput {
  pageId: string
  pageImageBase64: string
  images: { imageId: string; imageBase64: string; width: number; height: number }[]
}

export interface SegmentationConfig {
  promptName: string
  modelId: string
  minSide?: number
}

const DEFAULT_SEGMENTATION_MODEL = "openai:gpt-5.2"

/**
 * Build segmentation config from AppConfig.
 * Returns null unless explicitly enabled via image_filters.segmentation === true.
 * Defaults to GPT-5.2 when no model is configured.
 */
export function buildSegmentationConfig(
  appConfig: AppConfig
): SegmentationConfig | null {
  if (appConfig.image_filters?.segmentation !== true) return null

  return {
    promptName: appConfig.image_segmentation?.prompt ?? "image_segmentation",
    modelId: appConfig.image_segmentation?.model || DEFAULT_SEGMENTATION_MODEL,
    minSide: appConfig.image_segmentation?.min_side,
  }
}

/**
 * Ask the LLM whether images on a page contain multiple composited images
 * that should be separated. Returns segmentation decisions and bounding boxes.
 *
 * Pure function — no side effects.
 */
export async function segmentPageImages(
  input: SegmentationPageInput,
  config: SegmentationConfig,
  llmModel: LLMModel
): Promise<ImageSegmentationOutput> {
  if (input.images.length === 0) {
    return { results: [] }
  }

  const inputImageIds = input.images.map((img) => img.imageId)
  const imageDims = new Map(
    input.images.map((img) => [img.imageId, { width: img.width, height: img.height }])
  )

  const result = await llmModel.generateObject<{
    images: Array<{
      image_id: string
      reasoning: string
      needs_segmentation: boolean
      segments: Array<{
        label: string
        crop_left: number
        crop_top: number
        crop_right: number
        crop_bottom: number
      }>
    }>
  }>({
    schema: imageSegmentationLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      images: input.images,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as {
        images: Array<{
          image_id: string
          reasoning: string
          needs_segmentation: boolean
          segments: Array<{
            label: string
            crop_left: number
            crop_top: number
            crop_right: number
            crop_bottom: number
          }>
        }>
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
      for (const img of r.images) {
        if (!img.needs_segmentation) {
          if (img.segments.length > 0) {
            errors.push(
              `Image ${img.image_id}: segments must be empty when needs_segmentation is false.`
            )
          }
          continue
        }
        if (img.segments.length < 2) {
          errors.push(
            `Image ${img.image_id}: needs_segmentation is true but fewer than 2 segments provided. Segmentation requires at least 2 segments.`
          )
        }
        const dims = imageDims.get(img.image_id)
        if (!dims) continue
        for (let si = 0; si < img.segments.length; si++) {
          const seg = img.segments[si]
          const prefix = `Image ${img.image_id} segment ${si + 1} ("${seg.label}")`
          if (seg.crop_right <= seg.crop_left) {
            errors.push(`${prefix}: crop_right (${seg.crop_right}) must be greater than crop_left (${seg.crop_left}).`)
          }
          if (seg.crop_bottom <= seg.crop_top) {
            errors.push(`${prefix}: crop_bottom (${seg.crop_bottom}) must be greater than crop_top (${seg.crop_top}).`)
          }
          if (seg.crop_right > dims.width) {
            errors.push(`${prefix}: crop_right (${seg.crop_right}) exceeds image width (${dims.width}).`)
          }
          if (seg.crop_bottom > dims.height) {
            errors.push(`${prefix}: crop_bottom (${seg.crop_bottom}) exceeds image height (${dims.height}).`)
          }
        }
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: 2,
    maxTokens: 4096,
    log: {
      taskType: "image-segmentation",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  return {
    results: result.object.images.map((img) => ({
      imageId: img.image_id,
      reasoning: img.reasoning,
      needsSegmentation: img.needs_segmentation,
      ...(img.needs_segmentation && img.segments.length > 0
        ? {
            segments: img.segments.map((seg) => ({
              label: seg.label,
              cropLeft: seg.crop_left,
              cropTop: seg.crop_top,
              cropRight: seg.crop_right,
              cropBottom: seg.crop_bottom,
            })),
          }
        : {}),
    })),
  }
}

/**
 * Return the storage image ID for a segmented image.
 * Includes the node-data version so re-running segmentation creates new files.
 */
export function getSegmentedImageId(imageId: string, segIndex: number, version: number): string {
  return `${imageId}_seg${String(segIndex).padStart(3, "0")}_v${version}`
}

export interface AppliedSegment {
  sourceImageId: string
  segmentIndex: number
  label: string
  buffer: Buffer
  width: number
  height: number
}

const DEFAULT_SEGMENT_PADDING = 10

/**
 * Apply segmentation bounding boxes to images, returning cropped buffers.
 * Only returns entries for images that need segmentation.
 *
 * Each bounding box is expanded outward by `padding` pixels (default 10)
 * and clamped to the image dimensions. When clamping reduces padding on
 * one side (e.g. near an image edge), the lost space is added to the
 * opposite side so the content stays centered in the crop box.
 */
export function applySegmentation(
  segmentationOutput: ImageSegmentationOutput,
  getImageBase64: (imageId: string) => string,
  imageDims?: Map<string, { width: number; height: number }>,
  padding: number = DEFAULT_SEGMENT_PADDING,
): AppliedSegment[] {
  const results: AppliedSegment[] = []

  for (const result of segmentationOutput.results) {
    if (!result.needsSegmentation || !result.segments || result.segments.length === 0) {
      continue
    }

    const originalBase64 = getImageBase64(result.imageId)
    const buffer = Buffer.from(originalBase64, "base64")
    const dims = imageDims?.get(result.imageId)

    for (let i = 0; i < result.segments.length; i++) {
      const seg = result.segments[i]

      // Expand bounding box outward by padding, clamped to image bounds
      let left = Math.max(0, seg.cropLeft - padding)
      let top = Math.max(0, seg.cropTop - padding)
      let right = dims ? Math.min(dims.width, seg.cropRight + padding) : seg.cropRight + padding
      let bottom = dims ? Math.min(dims.height, seg.cropBottom + padding) : seg.cropBottom + padding

      // Compensate clamped padding on the opposite side to center content
      if (dims) {
        const leftLoss = Math.max(0, -(seg.cropLeft - padding))
        const topLoss = Math.max(0, -(seg.cropTop - padding))
        const rightLoss = Math.max(0, (seg.cropRight + padding) - dims.width)
        const bottomLoss = Math.max(0, (seg.cropBottom + padding) - dims.height)
        right = Math.min(dims.width, right + leftLoss)
        left = Math.max(0, left - rightLoss)
        bottom = Math.min(dims.height, bottom + topLoss)
        top = Math.max(0, top - bottomLoss)
      }

      const width = right - left
      const height = bottom - top
      if (width <= 0 || height <= 0) continue

      const cropped = applyCrop(buffer, {
        cropLeft: left,
        cropTop: top,
        cropRight: right,
        cropBottom: bottom,
      })
      results.push({
        sourceImageId: result.imageId,
        segmentIndex: i + 1,
        label: seg.label,
        buffer: cropped,
        width,
        height,
      })
    }
  }

  return results
}
