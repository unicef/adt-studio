import { z } from "zod"

/** Gemini API model IDs and reference limits; Nano Banana 2 is listed first. */
export const GOOGLE_IMAGE_MODELS = {
  "gemini-3.1-flash-image": 14,
  "gemini-3.1-flash-lite-image": 14,
  "gemini-3-pro-image": 14,
  "gemini-2.5-flash-image": 3,
} as const

export const GoogleImageModelId = z.enum(Object.keys(GOOGLE_IMAGE_MODELS) as [
  keyof typeof GOOGLE_IMAGE_MODELS,
  ...Array<keyof typeof GOOGLE_IMAGE_MODELS>,
])
export type GoogleImageModelId = z.infer<typeof GoogleImageModelId>
export const DEFAULT_GOOGLE_IMAGE_MODEL: GoogleImageModelId = "gemini-3.1-flash-image"

/** The subset of the Interactions REST response used by the image adapter. */
export const GoogleImageResponse = z.object({
  status: z.string(),
  steps: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({
      type: z.string(),
      mime_type: z.string().optional(),
      data: z.string().optional(),
    })).optional(),
  })).default([]),
})
