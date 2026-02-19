import { z } from "zod"

export const imageMeaningfulnessLLMSchema = z.object({
  images: z.array(
    z.object({
      image_id: z.string(),
      reasoning: z.string(),
      is_meaningful: z.boolean(),
    })
  ),
})
