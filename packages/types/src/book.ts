import { z } from "zod"
import { BookMetadata } from "./metadata.js"
import { BookSummaryOutput } from "./book-summary.js"
import { PartRange } from "./part.js"

export const BookLabel = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Label must be filesystem-safe")
export type BookLabel = z.infer<typeof BookLabel>

export const BookSummary = z.object({
  label: z.string(),
  title: z.string().nullable(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  languageCode: z.string().nullable(),
  pageCount: z.number().int(),
  hasSourcePdf: z.boolean(),
  needsRebuild: z.boolean(),
  rebuildReason: z.string().nullable(),
  completedStages: z.array(z.string()),
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
