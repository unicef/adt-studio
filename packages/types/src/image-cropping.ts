import { z } from "zod"

/**
 * LLM response schema for image cropping.
 * The LLM returns crop coordinates for each image, or indicates no crop is needed.
 */
export const imageCroppingLLMSchema = z.object({
  images: z.array(
    z.object({
      image_id: z.string(),
      reasoning: z.string(),
      should_crop: z.boolean(),
      crop_left: z.number().int().min(0),
      crop_top: z.number().int().min(0),
      crop_right: z.number().int().min(0),
      crop_bottom: z.number().int().min(0),
    })
  ),
})

export const ImageCropResult = z.object({
  imageId: z.string(),
  reasoning: z.string(),
  shouldCrop: z.boolean(),
  cropLeft: z.number().int().min(0).optional(),
  cropTop: z.number().int().min(0).optional(),
  cropRight: z.number().int().min(0).optional(),
  cropBottom: z.number().int().min(0).optional(),
})
export type ImageCropResult = z.infer<typeof ImageCropResult>

export const ImageCroppingOutput = z.object({
  crops: z.array(ImageCropResult),
})
export type ImageCroppingOutput = z.infer<typeof ImageCroppingOutput>
