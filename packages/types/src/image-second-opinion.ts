import { z } from "zod"

export const LEFT_OUT_CATEGORIES = [
  "exercise-visual",
  "illustration",
  "photo",
  "diagram",
  "icon",
  "logo-or-branding",
  "decoration",
  "divider-or-border",
  "text-as-image",
  "blank-or-artifact",
  "fragment",
] as const

export const LeftOutCategory = z.enum(LEFT_OUT_CATEGORIES)
export type LeftOutCategory = z.infer<typeof LeftOutCategory>

export const SecondOpinionVerdict = z.enum(["keep", "remove", "unsure"])
export type SecondOpinionVerdict = z.infer<typeof SecondOpinionVerdict>

export const SecondOpinionConfidence = z.enum(["high", "medium", "low"])
export type SecondOpinionConfidence = z.infer<typeof SecondOpinionConfidence>

export const imageSecondOpinionLLMSchema = z.object({
  images: z.array(
    z.object({
      image_id: z.string(),
      reasoning: z.string(),
      category: LeftOutCategory,
      verdict: SecondOpinionVerdict,
      confidence: SecondOpinionConfidence,
    })
  ),
})

export const SecondOpinionRequest = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(40),
  repeats: z.record(z.string(), z.object({ count: z.number().int().min(1), pages: z.number().int().min(1) })).optional(),
  language: z.string().min(2).max(20).optional(),
})
export type SecondOpinionRequest = z.infer<typeof SecondOpinionRequest>

export const SecondOpinionResult = z.object({
  imageId: z.string(),
  verdict: SecondOpinionVerdict,
  category: LeftOutCategory,
  reasoning: z.string(),
  confidence: SecondOpinionConfidence,
})
export type SecondOpinionResult = z.infer<typeof SecondOpinionResult>

export const SecondOpinionResponse = z.object({
  pageId: z.string(),
  modelId: z.string(),
  promptVersion: z.number().int(),
  language: z.string().optional(),
  results: z.array(SecondOpinionResult),
})
export type SecondOpinionResponse = z.infer<typeof SecondOpinionResponse>
