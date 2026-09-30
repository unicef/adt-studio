import { z } from "zod"

export const PositionedParagraph = z.object({
  /** Top position in CSS pixels at render scale */
  top: z.number(),
  /** Left position in CSS pixels at render scale */
  left: z.number(),
  /** Line height in CSS pixels at render scale */
  lineHeight: z.number(),
  /** HTML content of the paragraph (spans with font styling) */
  html: z.string(),
})
export type PositionedParagraph = z.infer<typeof PositionedParagraph>

export const ImageBounds = z.object({
  /** Left edge in PDF points */
  x: z.number(),
  /** Top edge in PDF points */
  y: z.number(),
  /** Width in PDF points */
  width: z.number(),
  /** Height in PDF points */
  height: z.number(),
})
export type ImageBounds = z.infer<typeof ImageBounds>

/**
 * A single draw operation from the PDF, in the walker's natural sequence.
 * Array order = PDF draw order = HTML DOM order, so later items appear on
 * top in the fixed-layout render. Coordinates are in viewport units (PDF
 * points at 1x, matching the page image's natural dimensions).
 */
export const DrawItemImage = z.object({
  kind: z.literal("image"),
  imageId: z.string(),
  bounds: ImageBounds,
  /**
   * SVG path `d` attribute for the active PDF clip applied to this image,
   * in absolute viewport coordinates (PDF points, top-left origin — same
   * space as `bounds`). Present only when the PDF clip meaningfully
   * reduces the image's visible area. The renderer translates these
   * coordinates to the image's local origin when emitting `<clipPath>`.
   */
  clipPath: z.string().optional(),
  /**
   * CSS `mix-blend-mode` keyword (e.g. "multiply") for images drawn under a
   * non-Normal PDF blend mode. Watercolor storybooks frequently rely on
   * `/Multiply` to make white image backgrounds composite as transparent.
   */
  blendMode: z.string().optional(),
  /**
   * Composed opacity (0..1) when the source PDF set group / per-op alpha
   * < 1. Renderer maps to CSS `opacity`. Absent for fully opaque draws.
   */
  opacity: z.number().optional(),
})
export type DrawItemImage = z.infer<typeof DrawItemImage>

/**
 * A run of characters inside a paragraph that share the same styling. A
 * paragraph is a sequence of segments. Styling lives as CSS-compatible
 * property/value pairs (e.g. `{ "font-family": "Palatino", "color": "#ff0000" }`)
 * so the viewer can re-inject them after any text-swap without parsing
 * inline strings. Font sizes are already converted to viewport `px` units.
 */
export const TextSegment = z.object({
  text: z.string(),
  style: z.record(z.string(), z.string()).optional(),
})
export type TextSegment = z.infer<typeof TextSegment>

/**
 * Bounding box of a logical text block — a cluster of paragraphs that
 * visually belong together (e.g. one speech bubble's wrapped lines). Same
 * coordinate space as a paragraph's `top` / `left` (PDF points, top-left
 * origin). Used by translation flows: the original block's width/height
 * tells the renderer how much room a translated string has to fit.
 */
export const TextBlockBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type TextBlockBounds = z.infer<typeof TextBlockBounds>

export const DrawItemParagraph = z.object({
  kind: z.literal("paragraph"),
  /** Stable per-page id used for `data-id` attributes (TTS, translation). */
  textId: z.string(),
  top: z.number(),
  left: z.number(),
  lineHeight: z.number(),
  /** Structured per-run styling. Concatenating `segments[].text` yields `text`. */
  segments: z.array(TextSegment),
  /** Plain-text concatenation of segment texts (convenience for catalogs). */
  text: z.string(),
  /**
   * Identifier of the visual text block this paragraph belongs to. Wrapped
   * lines inside the same speech bubble share a `blockId`; standalone
   * paragraphs get their own. Stable per page.
   */
  blockId: z.string().optional(),
  /**
   * Bounds of the whole block (union of every paragraph in it). Identical
   * across paragraphs that share `blockId`. Use for translation reflow /
   * fitting — the original container's max width and height.
   */
  blockBounds: TextBlockBounds.optional(),
  /**
   * Identifier of the merged paragraph this line belongs to. Wrapped
   * lines that the continuation heuristic treats as one logical
   * paragraph share `mergedParagraphId`; sentence breaks inside the
   * same block produce different ids. Sectioning collapses lines with
   * matching ids into a single text entry.
   */
  mergedParagraphId: z.string().optional(),
  /**
   * Inferred horizontal alignment of the block ("center" or "right").
   * Absent for left-aligned (CSS default). Carried so the renderer can
   * apply `text-align` on the merged-paragraph `<p>` and translations
   * stay visually centred / right-aligned when re-flowed.
   */
  textAlign: z.enum(["center", "right"]).optional(),
})
export type DrawItemParagraph = z.infer<typeof DrawItemParagraph>

export const DrawItem = z.discriminatedUnion("kind", [DrawItemImage, DrawItemParagraph])
export type DrawItem = z.infer<typeof DrawItem>

/**
 * `src` of the auto-fit script that fixed-layout pages load.
 *
 * Lives here because it has two independent writers that must agree byte for
 * byte: the pipeline renderer embeds it inside `#content` when emitting a
 * page, and the studio re-adds it when serializing an edited page back to
 * storage (DOMPurify strips the tag while the preview is live). A drift
 * between the two would break auto-fit only on manually edited pages — the
 * hardest case to notice — so both read this constant instead of repeating
 * the literal. Relative to the page, matching the packaged bundle layout.
 */
export const AUTO_FIT_SCRIPT_SRC = "./assets/auto-fit.js"

export const PositionedTextOutput = z.object({
  /**
   * Draw items (images and paragraphs) in the PDF's draw order. Array order
   * IS z-order: later items render on top.
   */
  drawItems: z.array(DrawItem),
  /** Page width in PDF points */
  pageWidth: z.number(),
  /** Page height in PDF points */
  pageHeight: z.number(),
  /** Rendered width in pixels (at render scale, typically 2x) */
  renderWidth: z.number(),
  /** Rendered height in pixels (at render scale, typically 2x) */
  renderHeight: z.number(),
})
export type PositionedTextOutput = z.infer<typeof PositionedTextOutput>
