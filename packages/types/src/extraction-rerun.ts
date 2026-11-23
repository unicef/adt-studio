import { z } from "zod"

/** What a Studio/API Extract run may do on a book that already has an
 * extraction (SPEC-0003 RAC-21 resume, RAC-22 retry, RAC-23 replace). */
export const ExtractRerunAction = z.enum(["resume", "retry", "replace"])
export type ExtractRerunAction = z.infer<typeof ExtractRerunAction>

/** The `extraction` field of a Studio/API stage run, accepted only on a run
 * from Extract to Extract: the action, bound to the extraction it applies to
 * (the record's `attemptId`, or null when the book has none). */
export const ExtractRerunRequest = z.object({
  action: ExtractRerunAction,
  attemptId: z.string().uuid().nullable(),
}).strict()
export type ExtractRerunRequest = z.infer<typeof ExtractRerunRequest>

/** Why no action is offered. Stable identifiers for Studio to translate, never
 * prose and never book content. */
export const ExtractRerunBlockedReason = z.enum([
  /** A stage run is active or queued for the book. */
  "run-active",
  /** Sectioning or later output, attempts, media or history exist. */
  "downstream-output",
  /** The book was not created from a PDF (for example an imported ADT). */
  "not-pdf-source",
  /** The book has exported parts; its extraction must stay mergeable. */
  "split-coordinator",
  /** A part's Extract stage is complete; its extraction cannot be replaced. */
  "part-book",
  /** A file, table or value the check does not recognize or cannot read. */
  "unrecognized-content",
  /** The extraction record is complete but the book has no pages. */
  "extraction-inconsistent",
])
export type ExtractRerunBlockedReason = z.infer<typeof ExtractRerunBlockedReason>

/** A SHA-256 digest of the content a retry or replace discards: every version
 * of the Extract nodes, every image row and the extraction record. It names
 * nothing in the book and is only ever compared for equality. */
export const ExtractContentToken = z.string().regex(/^[a-f0-9]{64}$/)
export type ExtractContentToken = z.infer<typeof ExtractContentToken>

/** Reported by step-status (RAC-24). `attemptId` names the extraction record a
 * later run request must be bound to; null when the book has none.
 * `contentToken` is the content a retry or replace request must be bound to;
 * null unless one of the two is offered. */
export const ExtractRerunStatus = z.object({
  actions: z.array(ExtractRerunAction),
  attemptId: z.string().uuid().nullable(),
  contentToken: ExtractContentToken.nullable(),
  blockedReason: ExtractRerunBlockedReason.nullable(),
}).strict()
export type ExtractRerunStatus = z.infer<typeof ExtractRerunStatus>
