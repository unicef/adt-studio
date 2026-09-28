import { z } from "zod"

/** Gemini API model IDs and reference limits; Nano Banana 2 is listed first. */
export const GOOGLE_IMAGE_MODELS = {
  "gemini-3.1-flash-image": 14,
  "gemini-3.1-flash-lite-image": 14,
  "gemini-3-pro-image": 14,
  "gemini-2.5-flash-image": 3,
} as const

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
