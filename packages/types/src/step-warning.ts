import { z } from "zod"

/**
 * Something a step that completed leaves for the user to check (SPEC-0021,
 * §Step warnings).
 *
 * Carried as *data*, like `PackagingWarning`: the steps run in
 * `packages/pipeline` and `apps/api`, which have no access to the Studio's
 * Lingui catalogs, so Studio owns the translated wording. The English
 * rendering the CLI and the server log print is `formatStepWarnings` in
 * `@adt/pipeline`. Adding a kind is a change to the spec's contract.
 *
 * - `pages-skipped` — a page-processing step finished after the user chose to
 *   skip pages that failed.
 * - `pages-unchanged` — Image Segmentation or Image Cropping: the model call
 *   failed for these pages, which kept their extracted images. `error` is one
 *   line of at most 120 code points.
 * - `summary-missing` — Book Summary: the model call failed and no summary was
 *   stored.
 * - `source-assessment` — Extract: the source assessment found warnings or
 *   criticals.
 */
export const StepWarning = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pages-skipped"), count: z.number().int().positive() }),
  z.object({
    kind: z.literal("pages-unchanged"),
    pages: z.array(z.object({ pageId: z.string(), error: z.string() })).min(1),
  }),
  z.object({ kind: z.literal("summary-missing"), error: z.string() }),
  z.object({
    kind: z.literal("source-assessment"),
    warning: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  }),
])
export type StepWarning = z.infer<typeof StepWarning>

export const StepWarnings = z.array(StepWarning)

/** Every kind, for exhaustiveness checks (Studio proves each has a message). */
export const STEP_WARNING_KINDS = StepWarning.options.map((option) => option.shape.kind.value)
export type StepWarningKind = StepWarning["kind"]
