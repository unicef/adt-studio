import { z } from "zod"

export const SectioningMode = z.enum(["dynamic", "page"])
export type SectioningMode = z.infer<typeof SectioningMode>

export const SectioningSourcePage = z.object({
  pageId: z.string(),
  pageNumber: z.number().int(),
})
export type SectioningSourcePage = z.infer<typeof SectioningSourcePage>

export const SectioningPreflightFailure = SectioningSourcePage.extend({
  reason: z.enum(["missing", "empty", "multiple", "invalid-data"]),
})
export type SectioningPreflightFailure = z.infer<typeof SectioningPreflightFailure>

export const SectioningPreflightResult = z.object({
  total: z.number().int().nonnegative(),
  failures: z.array(SectioningPreflightFailure),
  displayedPages: z.array(SectioningPreflightFailure).max(20),
})
export type SectioningPreflightResult = z.infer<typeof SectioningPreflightResult>

export const BookWriterOwner = z.object({
  token: z.string().uuid(), pid: z.number().int().positive(), host: z.string(),
})
export const SectioningLifecycle = z.object({
  version: z.literal(1), mode: SectioningMode, sectioningReady: z.boolean(),
})
export type SectioningLifecycle = z.infer<typeof SectioningLifecycle>
export const SectioningTransition = z.object({
  version: z.literal(1), oldHash: z.string(), newHash: z.string(),
  newMode: SectioningMode,
  affectedSteps: z.array(z.string()),
  previousStepRuns: z.array(z.object({
    step: z.string(), status: z.string(), started_at: z.string().nullable(),
    completed_at: z.string().nullable(), error: z.string().nullable(), message: z.string().nullable(),
  })),
})
export type SectioningTransition = z.infer<typeof SectioningTransition>

export const SectioningModeState = z.object({
  effectiveMode: SectioningMode,
  hasOutput: z.boolean(),
  stale: z.boolean(),
})
export type SectioningModeState = z.infer<typeof SectioningModeState>
