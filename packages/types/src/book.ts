import { z } from "zod"
import { BookMetadata } from "./metadata.js"
import { BookSummaryOutput } from "./book-summary.js"
import { PartRange } from "./part.js"
import { ProjectSourceKind } from "./project-identity.js"

export const BookLabel = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Label must be filesystem-safe")
export type BookLabel = z.infer<typeof BookLabel>

export const BookRecoveryCopyRequest = z.object({
  label: BookLabel,
  preserveOriginal: z.literal(true),
}).strict()
export type BookRecoveryCopyRequest = z.infer<typeof BookRecoveryCopyRequest>
export const BookRecoveryCopyErrorCode = z.enum([
  "BOOK_RECOVERY_COPY_UNSAFE", "BOOK_RECOVERY_COPY_DESTINATION_EXISTS",
  "BOOK_RECOVERY_COPY_NO_SPACE", "BOOK_RECOVERY_COPY_ACCESS_DENIED",
])
export type BookRecoveryCopyErrorCode = z.infer<typeof BookRecoveryCopyErrorCode>
export const BookRecoveryCopyResult = z.object({ label: BookLabel, sourceLabel: BookLabel }).strict()
export type BookRecoveryCopyResult = z.infer<typeof BookRecoveryCopyResult>

/** A partial recovery copy is never presented as a usable Library book. */
export const BOOK_RECOVERY_PENDING_FILE = ".book-recovery-pending.json"

export const BookRecoveryCopyAudit = z.object({
  format: z.literal("adt-book-recovery-copy-v1"),
  sourceLabel: BookLabel,
  label: BookLabel,
  createdAt: z.string().datetime(),
  files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
}).strict()
export type BookRecoveryCopyAudit = z.infer<typeof BookRecoveryCopyAudit>

export const BookSummary = z.object({
  label: z.string(),
  title: z.string().nullable(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  languageCode: z.string().nullable(),
  pageCount: z.number().int(),
  hasSourcePdf: z.boolean(),
  projectId: z.string().uuid(),
  sourceKind: ProjectSourceKind,
  /** The source currently driving the storyboard. An imported ADT revision can
   * temporarily supersede a project's original PDF without changing lineage. */
  workingSource: ProjectSourceKind,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  needsRebuild: z.boolean(),
  rebuildReason: z.string().nullable(),
  /** No database snapshot was read. Admission/recovery does not authorize rebuilding. */
  readUnavailable: z.boolean().optional(),
  readUnavailableReason: z.enum(["book-busy", "invalid-config", "invalid-data"]).optional(),
  completedStages: z.array(z.string()),
  storyboardNeedsReview: z.boolean().optional(),
  /** Lightweight Library summaries have not checked current Storyboard output yet. */
  storyboardVerificationPending: z.boolean().optional(),
  /** Unverified is distinct from a known missing or incomplete package. */
  previewStatus: z.enum(["complete", "incomplete", "unverified"]).optional(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  /** Set when this book was imported as a page-range part of a larger book. */
  part: z
    .object({ sourceLabel: z.string(), range: PartRange })
    .nullable(),
  /** Set when this book has been split into parts (coordinator side). */
  split: z
    .object({
      totalPages: z.number().int(),
      exportedParts: z.number().int(),
      /** Distinct pages covered by exported parts (split-off progress). */
      splitPages: z.number().int(),
      mergedPages: z.number().int(),
      fullySplit: z.boolean(),
      fullyMerged: z.boolean(),
    })
    .nullable(),
})
export type BookSummary = z.infer<typeof BookSummary>

export const BookDetail = BookSummary.extend({
  metadata: BookMetadata.nullable(),
  bookSummary: BookSummaryOutput.nullable(),
})
export type BookDetail = z.infer<typeof BookDetail>

export function parseBookLabel(label: string): string {
  const parsed = BookLabel.safeParse(label)
  if (parsed.success) {
    return parsed.data
  }

  const details = parsed.error.issues
    .map((issue) => issue.message)
    .filter((message) => message.length > 0)
    .join("; ")
  const suffix = details.length > 0 ? `. Details: ${details}` : ""
  throw new Error(`Invalid book label: label must be filesystem-safe${suffix}`)
}
