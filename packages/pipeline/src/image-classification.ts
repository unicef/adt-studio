import type { ImageFilters, ImageClassificationOutput, AppConfig } from "@adt/types"
import type { ImageData } from "@adt/storage"

export interface ImageClassifyConfig {
  filters: ImageFilters
}

/**
 * Classify images on a single page. Pure function — no side effects.
 * Filters images by size constraints and prunes full-page renders.
 */
export function classifyPageImages(
  pageId: string,
  images: ImageData[],
  config: ImageClassifyConfig
): ImageClassificationOutput {
  const { min_side, max_side } = config.filters

  return {
    images: images.map((img) => {
      // Full-page renders are always pruned
      if (img.imageId === `${pageId}_page`) {
        return { imageId: img.imageId, isPruned: true, reason: "full-page render" }
      }

      const shortSide = Math.min(img.width, img.height)
      const longSide = Math.max(img.width, img.height)

      if (min_side !== undefined && shortSide < min_side) {
        return {
          imageId: img.imageId,
          isPruned: true,
          reason: `shortest side ${shortSide}px < min_side ${min_side}px`,
        }
      }

      if (max_side !== undefined && longSide > max_side) {
        return {
          imageId: img.imageId,
          isPruned: true,
          reason: `longest side ${longSide}px > max_side ${max_side}px`,
        }
      }

      return { imageId: img.imageId, isPruned: false }
    }),
  }
}

/**
 * Build ImageClassifyConfig from AppConfig.
 */
export function buildImageClassifyConfig(appConfig: AppConfig): ImageClassifyConfig {
  return {
    filters: appConfig.image_filters ?? {},
  }
}
