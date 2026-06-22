import { z } from "zod"

/**
 * Page-range window of a "part" — a slice of a book handed to a contributor to
 * process independently. Pages are 1-indexed and inclusive.
 */
export const PartRange = z.object({
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
})
export type PartRange = z.infer<typeof PartRange>

/**
 * Manifest carried inside a part archive (`part.json` at the zip root, and
 * stored in the book directory after import so the book remembers it is a part).
 *
 * `fingerprint` is the full PipelineFingerprint object (kept loose here to avoid
 * coupling the manifest schema to the fingerprint internals); the merge gate
 * uses the flattened `identityHash` (hard) and `semanticsHash` (warn).
 */
export const PartManifest = z.object({
  /** Format marker / version. */
  adtPart: z.literal(1),
  /** The coordinator's book label this part was sliced from (advisory). */
  sourceLabel: z.string(),
  /** Display title for previews; null if metadata not yet available. */
  title: z.string().nullable(),
  /** The (spread-snapped) page window this part covers. */
  range: PartRange,
  /** Total pages in the source PDF (for boundary validation). */
  pageCount: z.number().int().min(0),
  fingerprint: z.unknown(),
  identityHash: z.string(),
  semanticsHash: z.string(),
  createdAt: z.string(),
  partLabelSuggestion: z.string(),
})
export type PartManifest = z.infer<typeof PartManifest>
