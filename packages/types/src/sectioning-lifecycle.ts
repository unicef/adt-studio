import { z } from "zod"

export const SectioningMode = z.enum(["dynamic", "page"])
export type SectioningMode = z.infer<typeof SectioningMode>

export const SectioningLifecycle = z.object({
  version: z.literal(1), mode: SectioningMode, sectioningReady: z.boolean(),
  storyboardPending: z.boolean().optional(),
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
  preferenceChanged: z.boolean(),
})
export type SectioningModeState = z.infer<typeof SectioningModeState>

export const StoryboardCoverage = z.object({
  complete: z.boolean(),
  included: z.number().int().nonnegative(),
  rendered: z.number().int().nonnegative(),
  missingPages: z.array(z.string()),
  missingSections: z.array(z.object({ pageId: z.string(), sectionId: z.string() })),
})
export type StoryboardCoverage = z.infer<typeof StoryboardCoverage>

/** Bounded portable paths only; diagnostics never expose absolute host paths. */
const PackageDiagnosticPath = z.string().min(1).max(240).refine(value =>
  !/[\\:\x00-\x1f\x7f]/.test(value) && !value.startsWith("/") &&
  !value.split("/").some(part => part === ".." || part === "." || !part))
export const PackageFileDiagnostic = z.object({
  document: PackageDiagnosticPath.optional(), member: PackageDiagnosticPath.optional(),
})
export type PackageFileDiagnostic = z.infer<typeof PackageFileDiagnostic>
