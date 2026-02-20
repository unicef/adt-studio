import { z } from "zod"

export const ImageFilters = z.object({
  min_side: z.number().int().min(0).optional(),
  max_side: z.number().int().min(0).optional(),
  min_stddev: z.number().min(0).optional(),
  meaningfulness: z.boolean().optional(),
  segmentation: z.boolean().optional(),
  cropping: z.boolean().optional(),
})
export type ImageFilters = z.infer<typeof ImageFilters>

export const ImageClassificationResult = z.object({
  imageId: z.string(),
  isPruned: z.boolean(),
  reason: z.string().optional(),
})
export type ImageClassificationResult = z.infer<typeof ImageClassificationResult>

export const ImageClassificationOutput = z.object({
  images: z.array(ImageClassificationResult),
})
export type ImageClassificationOutput = z.infer<typeof ImageClassificationOutput>
