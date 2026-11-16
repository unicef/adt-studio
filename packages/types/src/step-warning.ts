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
 *   criticals, or could not evaluate every check (`incompletePages > 0`).
 *   Derived from the latest assessment on read and never persisted.
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
    incompletePages: z.number().int().nonnegative(),
  }),
])
export type StepWarning = z.infer<typeof StepWarning>

export const StepWarnings = z.array(StepWarning)

/** Every kind, for exhaustiveness checks (Studio proves each has a message). */
export const STEP_WARNING_KINDS = StepWarning.options.map((option) => option.shape.kind.value)
export type StepWarningKind = StepWarning["kind"]

/**
 * Read model only, never written: the elements of a stored list this app
 * cannot parse (a kind from a newer app, or a malformed element), counted so a
 * step with them still reads as having warnings.
 */
export const UnrecognizedStepWarning = z.object({ kind: z.literal("unrecognized"), count: z.number().int().positive() })
export type UnrecognizedStepWarning = z.infer<typeof UnrecognizedStepWarning>

/** A done step's warnings as read back: the known ones plus at most one `unrecognized`. */
export const StepWarningView = z.union([StepWarning, UnrecognizedStepWarning])
export type StepWarningView = z.infer<typeof StepWarningView>

/**
 * What `step_runs.warnings` holds: the warnings stamped with the completion
 * they belong to. `completedAt` equals the row's `completed_at` when this app
 * wrote both; any other completion (an older app's) leaves them unequal.
 */
export const StoredStepWarnings = z.object({ completedAt: z.string(), items: z.array(z.unknown()) })
export type StoredStepWarnings = z.infer<typeof StoredStepWarnings>

/**
 * Where a done step's warnings come from: `recorded` by this app (the envelope
 * matches the completion), or `legacy`, a completion by an app that does not
 * record them, read through the bounded adapter for its skip message.
 */
export const StepWarningSource = z.enum(["recorded", "legacy"])
export type StepWarningSource = z.infer<typeof StepWarningSource>

/**
 * The one warning-bearing message released apps write: their skip note. Frozen;
 * newer outcomes are typed from the start and never matched on text.
 */
export const LEGACY_SKIP_MESSAGE = /^Completed — ([1-9]\d*) page\(s\) skipped$/
