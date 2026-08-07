import { z } from "zod"
import { TextBlockBounds } from "./positioned-text.js"

// ── Tree node ───────────────────────────────────────────────────
// A content node is either a container (has `structure`, usually `children`)
// or a leaf (has `role` and `text`). The two arms are mutually exclusive;
// the runtime validator enforces this because Zod cannot express it cleanly
// alongside recursion without blowing up OpenAI's structured-output support.
//
// Images are represented as leaves with role="image" whose `nodeId` IS the
// image file's id — an image_group container wraps them alongside
// caption/label leaves.
export type ContentNodeData = {
  nodeId: string
  isPruned: boolean

  // Container arm (mutually exclusive with leaf arm)
  structure?: string
  children?: ContentNodeData[]

  // Leaf arm
  role?: string
  text?: string
  /** Authoritative semantic heading depth (1..6), when this leaf is a heading. */
  headingLevel?: number
  /** Book-outline entry this heading was matched to during sectioning. */
  outlineEntryId?: string
  /** Repeated publisher-style cluster learned at book level. */
  headingStyleClusterId?: string
}

export const ContentNodeData: z.ZodType<ContentNodeData> = z.lazy(() =>
  z.object({
    nodeId: z.string(),
    isPruned: z.boolean(),
    structure: z.string().optional(),
    children: z.array(ContentNodeData).optional(),
    role: z.string().optional(),
    text: z.string().optional(),
    headingLevel: z.number().int().min(1).max(6).optional(),
    outlineEntryId: z.string().optional(),
    headingStyleClusterId: z.string().optional(),
  })
)

// ── Placement sidecar (fixed-layout & friends) ───────────────────
// Reflowable content's sectioning is a pure semantic tree. Some renderers
// (fixed-layout EPUB, two-column print, accessibility overlays) need
// PDF-coordinate placement metadata for the same nodes. Rather than
// polluting the tree's leaf shape with optional positioning fields,
// section carries an out-of-band `placement` map keyed by `nodeId`.
//
// Renderers that don't care about placement ignore the map; renderers that
// do consume it without having to special-case section "modes". The same
// data is available to LLM rendering, two-column print, activity detection,
// translation reflow, accessibility — anything that benefits from knowing
// the original PDF coordinates.

/**
 * Fixed-layout positioning metadata carried on a text leaf. Coordinates are
 * in viewport units (PDF points at 1x, matching the page image's natural
 * dimensions). When present, the renderer re-injects these as inline styles
 * so absolute positioning survives any downstream HTML regeneration.
 */
export const TextPosition = z.object({
  top: z.number(),
  left: z.number(),
  lineHeight: z.number(),
})
export type TextPosition = z.infer<typeof TextPosition>

/**
 * A styled run inside a placed text leaf. Parallel to `TextSegment` in
 * positioned-text.ts — kept here so section JSON is self-contained.
 */
export const SectionTextSegment = z.object({
  text: z.string(),
  style: z.record(z.string(), z.string()).optional(),
})
export type SectionTextSegment = z.infer<typeof SectionTextSegment>

/**
 * Fixed-layout placement bounds for an image leaf. Coordinates are in
 * viewport units (PDF points at 1x). When present, the renderer positions
 * the image at these coordinates; when absent, the image fills the viewport.
 */
export const ImagePartBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type ImagePartBounds = z.infer<typeof ImagePartBounds>

/** Fixed-layout viewport dimensions for the page (PDF points at 1x). */
export const SectionViewport = z.object({
  width: z.number(),
  height: z.number(),
})
export type SectionViewport = z.infer<typeof SectionViewport>

/**
 * Out-of-band placement data for a single tree node. All fields are
 * optional — text-leaf nodes typically carry the text-shape fields,
 * image-leaf nodes typically carry the image-shape fields, and container
 * nodes generally have no entry at all.
 */
export const NodePlacement = z.object({
  // Text-leaf placement
  position: TextPosition.optional(),
  segments: z.array(SectionTextSegment).optional(),
  /**
   * Identifier of the visual block this text leaf belongs to. Wrapped
   * lines inside the same bubble share a `blockId`; standalone leaves get
   * their own. Stable per page.
   */
  blockId: z.string().optional(),
  /**
   * Bounds of the block this text leaf belongs to. Identical for all
   * leaves with the same `blockId`. Use for translation reflow / fitting.
   */
  blockBounds: TextBlockBounds.optional(),
  /**
   * Inferred horizontal alignment ("center" or "right"). Absent for the
   * CSS default (left). The renderer uses this to set `text-align` on
   * the merged `<p>` so re-flowed translations preserve the original
   * bubble's alignment.
   */
  textAlign: z.enum(["center", "right"]).optional(),
  /**
   * Per-leaf render-box height in PDF points (top-left origin space).
   * When multiple text leaves share a `blockId`, each one's `<p>` should
   * only occupy its slice of the block (top of this leaf → top of the
   * next leaf, or block bottom for the last) — otherwise the absolute
   * boxes stack with the full block height and overlap. Absent when the
   * leaf is the only one in its block; renderer falls back to
   * `blockBounds.height`.
   */
  renderHeight: z.number().optional(),

  // Image-leaf placement
  bounds: ImagePartBounds.optional(),
  /**
   * SVG path `d` for the PDF clip applied to this image at draw time, in
   * absolute viewport coordinates. Renderer translates to image-local
   * coords when emitting `<clipPath>`. Absent when the source PDF didn't
   * meaningfully clip the image.
   */
  clipPath: z.string().optional(),
  /**
   * CSS `mix-blend-mode` keyword for images drawn under a non-Normal PDF
   * blend mode (commonly "multiply" in illustrated storybooks).
   */
  blendMode: z.string().optional(),
  /** Composed opacity (0..1) from PDF group / per-op alpha. */
  opacity: z.number().optional(),
})
export type NodePlacement = z.infer<typeof NodePlacement>

// ── Section ─────────────────────────────────────────────────────

export const PageSectioningSection = z.object({
  sectionId: z.string(),
  sectionType: z.string(),
  backgroundColor: z.string(),
  textColor: z.string(),
  pageNumber: z.number().int().nullable(),
  isPruned: z.boolean(),
  nodes: z.array(ContentNodeData),
  /**
   * Fixed-layout viewport dimensions, in PDF points at 1x. Present on
   * fixed-layout sections so renderers can produce HTML without consulting
   * the positioned-text node separately.
   */
  viewport: SectionViewport.optional(),
  /**
   * Per-node placement sidecar keyed by `nodeId`. Present whenever the
   * sectioning step had PDF-coordinate data to attach (currently:
   * fixed-layout pages). Renderers that don't need placement ignore it.
   */
  placement: z.record(z.string(), NodePlacement).optional(),
  /**
   * Pages other than the hosting page whose content was merged into this
   * section (cross-page merges of activities/passages that continue across
   * a page break). Renderers and visual reviewers use this to fetch the
   * additional page images so merged-in content has a visual reference
   * instead of being force-matched against the hosting page's image alone.
   */
  sourcePageIds: z.array(z.string()).optional(),
})
export type PageSectioningSection = z.infer<typeof PageSectioningSection>

export const PageSectioningOutput = z.object({
  reasoning: z.string(),
  sections: z.array(PageSectioningSection),
})
export type PageSectioningOutput = z.infer<typeof PageSectioningOutput>

// ── LLM-facing schemas ──────────────────────────────────────────
// Recursive via z.lazy() so the JSON schema produced for OpenAI
// structured outputs has proper `items` on `children` (OpenAI strict
// mode rejects empty / missing items). Recursion is expressed via $ref
// in the generated schema, which OpenAI supports since 2024-08.

type LLMContentNodeShape = {
  structure?: string | null
  role?: string | null
  text?: string | null
  image_id?: string | null
  heading_level?: number | null
  outline_entry_id?: string | null
  heading_style_cluster_id?: string | null
  children?: LLMContentNodeShape[] | null
}

const LLMContentNodeShape: z.ZodType<LLMContentNodeShape> = z.lazy(() =>
  z.object({
    structure: z.string().nullish(),
    role: z.string().nullish(),
    text: z.string().nullish(),
    image_id: z.string().nullish(),
    heading_level: z.number().int().min(1).max(6).nullish(),
    outline_entry_id: z.string().nullish(),
    heading_style_cluster_id: z.string().nullish(),
    children: z.array(LLMContentNodeShape).nullish(),
  })
)

export function buildPageSectioningLLMSchema() {
  return z.object({
    reasoning: z.string(),
    sections: z.array(
      z.object({
        section_type: z.string(),
        background_color: z.string(),
        text_color: z.string(),
        page_number: z.number().int().nullable(),
        nodes: z.array(LLMContentNodeShape),
      })
    ),
  })
}

export function buildPageSectioningRefinementLLMSchema() {
  return z.object({
    approved: z.boolean(),
    reasoning: z.string(),
    nodes_and_sections: z
      .object({
        reasoning: z.string(),
        sections: z.array(
          z.object({
            section_type: z.string(),
            background_color: z.string(),
            text_color: z.string(),
            page_number: z.number().int().nullable(),
            nodes: z.array(LLMContentNodeShape),
          })
        ),
      })
      .nullable(),
  })
}
