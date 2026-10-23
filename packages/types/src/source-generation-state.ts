import { z } from "zod"

export const SourceGeneratorStep = z.enum(["quiz-generation", "glossary", "toc-generation"])
export type SourceGeneratorStep = z.infer<typeof SourceGeneratorStep>

/** Only the input-selection policy is needed to compare later source edits.
 * Absent policy means legacy output, whose original settings are unproven. */
export const SourceGenerationPolicy = z.object({
  quiz: z.object({ pagesPerQuiz: z.number().int().positive(), quizSectionTypes: z.array(z.string()).optional() }).optional(),
  tocMode: z.enum(["extract", "dynamic"]).optional(),
})
export type SourceGenerationPolicy = z.infer<typeof SourceGenerationPolicy>
export const SourceGenerationState = z.object({
  version: z.literal(1),
  needsUpdate: z.boolean(),
  policy: SourceGenerationPolicy,
  inputSignature: z.string().optional(),
})
export type SourceGenerationState = z.infer<typeof SourceGenerationState>

export const SourceGenerationReceipt = z.object({
  step: SourceGeneratorStep,
  policy: SourceGenerationPolicy,
  inputSignature: z.string(),
})
export type SourceGenerationReceipt = z.infer<typeof SourceGenerationReceipt>
