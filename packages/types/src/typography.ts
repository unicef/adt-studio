import { z } from "zod"

/**
 * A single editable text style in the book's typography scale. Size is the
 * source of truth — it is applied deterministically at render time via the
 * `className` (a semantic `adt-*` class the renderer emits) and overrides any
 * size the generation model might otherwise choose. `desktopPx`/`mobilePx` are
 * the clamp() ceiling/floor; the rendered size scales fluidly between them.
 */
export const TypographyStyle = z.object({
  /** Stable id (e.g. "body", "chapter_title"). */
  key: z.string(),
  /** Human label for the Fonts-tab editor. */
  label: z.string(),
  /** Semantic class the renderer applies and this size targets (e.g. "adt-h1"). */
  className: z.string(),
  /** Target size on desktop (clamp ceiling), px. */
  desktopPx: z.number(),
  /** Minimum size on mobile (clamp floor), px. */
  mobilePx: z.number(),
  /** Optional weight override. Omitted → the styleguide keeps control of weight. */
  fontWeight: z.number().optional(),
})
export type TypographyStyle = z.infer<typeof TypographyStyle>

/** The book's editable typography scale — one source of truth for text sizes. */
export const BookTypography = z.object({
  styles: z.array(TypographyStyle),
})
export type BookTypography = z.infer<typeof BookTypography>

/**
 * Accessible, inclusive defaults (larger than most source PDFs). Used when a
 * book has no saved typography yet. Edited on the Fonts tab. Sizes are
 * desktop → mobile; the renderer interpolates fluidly between them.
 */
// Sizes align to Tailwind's font-size scale (text-5xl=48, 4xl=36, 3xl=30,
// 2xl=24, xl=20, lg=18, base=16, sm=14) so the editor shows a clean token.
export const DEFAULT_TYPOGRAPHY: BookTypography = {
  styles: [
    { key: "chapter_title", label: "Chapter title", className: "adt-h1", desktopPx: 48, mobilePx: 30 },
    { key: "section_heading", label: "Section heading", className: "adt-h2", desktopPx: 36, mobilePx: 24 },
    { key: "subheading", label: "Subheading", className: "adt-h3", desktopPx: 30, mobilePx: 20 },
    { key: "body", label: "Body", className: "adt-body", desktopPx: 24, mobilePx: 16 },
    { key: "caption", label: "Caption", className: "adt-caption", desktopPx: 18, mobilePx: 14 },
  ],
}
