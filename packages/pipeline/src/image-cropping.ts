import type { AppConfig, ImageCroppingOutput } from "@adt/types"
import { imageCroppingLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { cropPng } from "@adt/pdf"
import jpeg from "jpeg-js"

export interface CroppingPageInput {
  pageId: string
  pageImageBase64: string
  images: { imageId: string; imageBase64: string; width: number; height: number }[]
}

export interface CroppingConfig {
  promptName: string
  modelId: string
}

/**
 * Build cropping config from AppConfig.
 * Returns null when disabled via image_filters.cropping === false or no model set.
 */
export function buildCroppingConfig(
  appConfig: AppConfig
): CroppingConfig | null {
  if (appConfig.image_filters?.cropping === false) return null

  // Cropping must be explicitly enabled
  if (appConfig.image_filters?.cropping !== true) return null

  const model =
    appConfig.image_cropping?.model ??
    appConfig.image_meaningfulness?.model
  if (!model) return null

  return {
    promptName: appConfig.image_cropping?.prompt ?? "image_cropping",
    modelId: model,
  }
}

/**
 * Ask the LLM to determine crop coordinates for images on a page.
 * Returns crop info for each image — some may not need cropping.
 *
 * Pure function — no side effects.
 */
export async function cropPageImages(
  input: CroppingPageInput,
  config: CroppingConfig,
  llmModel: LLMModel
): Promise<ImageCroppingOutput> {
  if (input.images.length === 0) {
    return { crops: [] }
  }

  const inputImageIds = input.images.map((img) => img.imageId)
  const imageDims = new Map(
    input.images.map((img) => [img.imageId, { width: img.width, height: img.height }])
  )

  const result = await llmModel.generateObject<{
    images: Array<{
      image_id: string
      reasoning: string
      should_crop: boolean
      crop_left: number
      crop_top: number
      crop_right: number
      crop_bottom: number
    }>
  }>({
    schema: imageCroppingLLMSchema,
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
          should_crop: boolean
          crop_left: number
          crop_top: number
          crop_right: number
          crop_bottom: number
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
      // Validate crop coordinates for images that should be cropped
      for (const img of r.images) {
        if (!img.should_crop) continue
        const dims = imageDims.get(img.image_id)
        if (!dims) continue
        if (img.crop_right <= img.crop_left) {
          errors.push(
            `Image ${img.image_id}: crop_right (${img.crop_right}) must be greater than crop_left (${img.crop_left}).`
          )
        }
        if (img.crop_bottom <= img.crop_top) {
          errors.push(
            `Image ${img.image_id}: crop_bottom (${img.crop_bottom}) must be greater than crop_top (${img.crop_top}).`
          )
        }
        if (img.crop_right > dims.width) {
          errors.push(
            `Image ${img.image_id}: crop_right (${img.crop_right}) exceeds image width (${dims.width}).`
          )
        }
        if (img.crop_bottom > dims.height) {
          errors.push(
            `Image ${img.image_id}: crop_bottom (${img.crop_bottom}) exceeds image height (${dims.height}).`
          )
        }
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: 2,
    maxTokens: 4096,
    log: {
      taskType: "image-cropping",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  return {
    crops: result.object.images.map((img) => ({
      imageId: img.image_id,
      reasoning: img.reasoning,
      shouldCrop: img.should_crop,
      ...(img.should_crop
        ? {
            cropLeft: img.crop_left,
            cropTop: img.crop_top,
            cropRight: img.crop_right,
            cropBottom: img.crop_bottom,
          }
        : {}),
    })),
  }
}

/**
 * Apply crop coordinates to an image buffer.
 * Supports both PNG and JPEG inputs. PNG stays PNG, JPEG stays JPEG.
 */
export function applyCrop(
  imageBuffer: Buffer,
  crop: { cropLeft: number; cropTop: number; cropRight: number; cropBottom: number }
): Buffer {
  const left = crop.cropLeft
  const top = crop.cropTop
  const width = crop.cropRight - crop.cropLeft
  const height = crop.cropBottom - crop.cropTop

  if (width <= 0 || height <= 0) {
    return imageBuffer
  }

  // PNG
  if (
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    return cropPng(imageBuffer, { left, top, width, height })
  }

  // JPEG — decode, crop raw pixels, re-encode
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    const decoded = jpeg.decode(imageBuffer, { useTArray: true })
    const cropData = Buffer.alloc(width * height * 4)

    for (let y = 0; y < height; y++) {
      const srcOffset = ((top + y) * decoded.width + left) * 4
      const dstOffset = y * width * 4
      Buffer.from(decoded.data.buffer).copy(
        cropData,
        dstOffset,
        srcOffset,
        srcOffset + width * 4
      )
    }

    const encoded = jpeg.encode(
      { data: cropData, width, height },
      90
    )
    return Buffer.from(encoded.data)
  }

  throw new Error(
    `Unsupported image format (magic bytes: 0x${imageBuffer[0].toString(16)} 0x${imageBuffer[1].toString(16)})`
  )
}

/**
 * Return the storage image ID for a cropped version of an image.
 * Includes the node-data version so re-running cropping creates a new file
 * rather than overwriting the previous crop.
 */
export function getCroppedImageId(imageId: string, version: number): string {
  return `${imageId}_crop_v${version}`
}

export interface AppliedCrop {
  imageId: string
  buffer: Buffer
  width: number
  height: number
}

/**
 * Apply crop coordinates to images, returning buffers ready to be written to storage.
 * Only returns entries for images that actually need cropping.
 */
export function applyCrops(
  croppingOutput: ImageCroppingOutput,
  getImageBase64: (imageId: string) => string
): AppliedCrop[] {
  const results: AppliedCrop[] = []

  for (const crop of croppingOutput.crops) {
    if (
      !crop.shouldCrop ||
      crop.cropLeft === undefined ||
      crop.cropTop === undefined ||
      crop.cropRight === undefined ||
      crop.cropBottom === undefined
    ) {
      continue
    }

    const width = crop.cropRight - crop.cropLeft
    const height = crop.cropBottom - crop.cropTop
    if (width <= 0 || height <= 0) continue

    const originalBase64 = getImageBase64(crop.imageId)
    const buffer = Buffer.from(originalBase64, "base64")
    const cropped = applyCrop(buffer, {
      cropLeft: crop.cropLeft,
      cropTop: crop.cropTop,
      cropRight: crop.cropRight,
      cropBottom: crop.cropBottom,
    })
    results.push({ imageId: crop.imageId, buffer: cropped, width, height })
  }

  return results
}
