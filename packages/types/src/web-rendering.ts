import { z } from "zod"

export const SectionRendering = z.object({
  sectionIndex: z.number().int(),
  sectionType: z.string(),
  reasoning: z.string(),
  html: z.string(),
  activityReasoning: z.string().optional(),
  activityAnswers: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .optional(),
  /** Set when a pre-render type check corrected the assigned section type. */
  correctedSectionType: z.string().optional(),
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

export const activityTypeCheckLLMSchema = z.object({
  reasoning: z.string(),
  correct_type: z.string(),
})

export const visualReviewLLMSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string(),
  content: z.string(),
})
