import { z } from "zod"

/**
 * Max upscale for a fixed-layout page filling its viewport. Shared by the
 * storyboard editor (`BookPreviewFrame`) and the packaged reader's fit script
 * (`renderPageHtml`) so the preview/export matches the size the user edits at.
 * 2× keeps rasterised art from getting too soft.
 */
export const FIXED_LAYOUT_MAX_SCALE = 2

export const SectionRendering = z.object({
  sectionIndex: z.number().int(),
  sectionType: z.string(),
  reasoning: z.string(),
  html: z.string(),
  activityReasoning: z.string().optional(),
  activityAnswers: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .optional(),
})
export type SectionRendering = z.infer<typeof SectionRendering>

export const WebRenderingOutput = z.object({
  sections: z.array(SectionRendering),
})
export type WebRenderingOutput = z.infer<typeof WebRenderingOutput>

export const webRenderingLLMSchema = z.object({
  reasoning: z.string(),
  content: z.string(),
})

export const activityAnswersLLMSchema = z.object({
  reasoning: z.string(),
  answers: z.array(
    z.object({
      id: z.string(),
      value: z.union([z.string(), z.boolean(), z.number()]),
    })
  ),
})

export const visualReviewLLMSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string(),
  content: z.string(),
})

export const editVerifyLLMSchema = z.object({
  applied: z.boolean(),
  reason: z.string(),
})
