import { z } from "zod"

/**
 * LLM response schema for image segmentation.
 * The LLM decides per-image whether it contains multiple distinct images
 * composited together, and if so, provides bounding boxes for each segment.
 */
export const imageSegmentationLLMSchema = z.object({
  images: z.array(
    z.object({
      image_id: z.string(),
      reasoning: z.string(),
      needs_segmentation: z.boolean(),
      segments: z.array(
        z.object({
          label: z.string(),
          crop_left: z.number().int().min(0),
          crop_top: z.number().int().min(0),
          crop_right: z.number().int().min(0),
          crop_bottom: z.number().int().min(0),
        })
      ),
    })
  ),
})

export const ImageSegmentRegion = z.object({
  label: z.string(),
  cropLeft: z.number().int().min(0),
  cropTop: z.number().int().min(0),
  cropRight: z.number().int().min(0),
  cropBottom: z.number().int().min(0),
})
export type ImageSegmentRegion = z.infer<typeof ImageSegmentRegion>

export const ImageSegmentResult = z.object({
  imageId: z.string(),
  reasoning: z.string(),
  needsSegmentation: z.boolean(),
  segments: z.array(ImageSegmentRegion).optional(),
})
export type ImageSegmentResult = z.infer<typeof ImageSegmentResult>

export const ImageSegmentationOutput = z.object({
  results: z.array(ImageSegmentResult),
})
export type ImageSegmentationOutput = z.infer<typeof ImageSegmentationOutput>
