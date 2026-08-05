import type { ImageFilters, ImageClassificationOutput, AppConfig } from "@adt/types"
import type { ImageData } from "@adt/storage"
import { grayscaleStdDev } from "./image-complexity.js"

export interface ImageClassifyConfig {
  filters: ImageFilters
  getImageBytes?: (imageId: string) => Buffer
}

/**
 * Classify images on a single page. Pure function — no side effects.
 * Filters images by size constraints, pixel complexity, and prunes full-page renders.
 */
export function classifyPageImages(
  pageId: string,
  images: ImageData[],
  config: ImageClassifyConfig
): ImageClassificationOutput {
  const { min_side, max_side, min_stddev } = config.filters

  return {
    images: images.map((img) => {
      // Full-page renders are always pruned
      if (img.imageId === `${pageId}_page`) {
        return { imageId: img.imageId, isPruned: true, reason: "full-page render" }
      }

      const shortSide = Math.min(img.width, img.height)
      const longSide = Math.max(img.width, img.height)

      // Direct raster/vector assets can be publication marks (signatures,
      // seals, approval stamps) and are often intentionally small. Size and
      // pixel-complexity thresholds are useful for noisy page-crop artifacts,
      // but must not discard these authentic assets before sectioning has a
      // chance to identify them. The semantic/image-meaningfulness stages
      // still decide whether such an asset belongs in the page tree.
      const preservePublicationAsset =
        img.renderMethod === "raster" || img.renderMethod === "vector"

      if (preservePublicationAsset) {
        return { imageId: img.imageId, isPruned: false }
      }

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

      // Complexity filter — runs after size filters (more expensive, needs pixel data)
      if (min_stddev !== undefined && config.getImageBytes) {
        const imageBytes = config.getImageBytes(img.imageId)
        const stddev = grayscaleStdDev(imageBytes)
        if (stddev < min_stddev) {
          return {
            imageId: img.imageId,
            isPruned: true,
            reason: `stddev ${stddev.toFixed(1)} < min_stddev ${min_stddev}`,
          }
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
