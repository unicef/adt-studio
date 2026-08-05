import { z } from "zod"

/**
 * Per-page extraction warning surfaced in the Extract UI.
 *
 * - `text-layer-missing` — the page's embedded text layer produced no text, yet
 *   the Sectioning step (vision) recovered text from the page image. This means
 *   the page genuinely has text the PDF isn't exposing directly (a scanned or
 *   image-only page), so downstream quality suffers and the user should prefer a
 *   text-based PDF.
 *
 * Modeled as an enum (rather than a boolean) so additional categories can be
 * added later without changing the field shape.
 */
export const ExtractionWarning = z.enum(["text-layer-missing"])
export type ExtractionWarning = z.infer<typeof ExtractionWarning>
