import { z } from "zod"

/**
 * The message channel between Studio's Preview and the ADT reader running in
 * its iframe.
 *
 * The preview is book content: LLM-generated, imported or hand-edited HTML.
 * In the desktop app it is served from the API's own port, another origin
 * than Studio's `app://`, so its scripts cannot reach Studio's storage or the
 * desktop bridge, and in exchange Studio cannot read the preview's document
 * either. The web build (Docker, Vite dev) serves Studio and the API from one
 * origin, so there the preview is not isolated; the channel works the same
 * way regardless. Everything Studio needs from the page, and every change it
 * makes to it, crosses this channel as one of the messages below.
 */

/** The reader page currently open in the preview. */
export const previewBridgePageSchema = z.object({
  sectionId: z.string().nullable(),
  /** `location.pathname` of the page. */
  href: z.string(),
  title: z.string().nullable(),
  hasImages: z.boolean(),
  hasActivity: z.boolean(),
  signLanguageEnabled: z.boolean(),
})

/** Reader → Studio: sent on boot and after every page turn. */
export const previewBridgePageMessageSchema = z.object({
  type: z.literal("adt-preview/page"),
  page: previewBridgePageSchema,
})

/** Reader → Studio: the reader dropped an outline on its own because the
 *  pointer moved into the preview, so no finding is hovered any more. */
export const previewBridgeHighlightClearedMessageSchema = z.object({
  type: z.literal("adt-preview/highlight-cleared"),
})

export const previewBridgeReaderMessageSchema = z.discriminatedUnion("type", [
  previewBridgePageMessageSchema,
  previewBridgeHighlightClearedMessageSchema,
])

export const PREVIEW_HIGHLIGHT_SEVERITIES = [
  "critical",
  "serious",
  "moderate",
  "minor",
  "unknown",
] as const

/** Studio → reader: outline the elements an accessibility finding points at.
 *  An empty `targets` list clears the outline. */
export const previewBridgeHighlightMessageSchema = z.object({
  type: z.literal("adt-preview/highlight"),
  targets: z.array(z.string()),
  severity: z.enum(PREVIEW_HIGHLIGHT_SEVERITIES),
})

/** Studio → reader: open another page of the book. `href` resolves against
 *  the reader's current URL and must stay on the reader's origin. */
export const previewBridgeNavigateMessageSchema = z.object({
  type: z.literal("adt-preview/navigate"),
  href: z.string().min(1),
})

export const previewBridgeStudioMessageSchema = z.discriminatedUnion("type", [
  previewBridgeHighlightMessageSchema,
  previewBridgeNavigateMessageSchema,
])

export type PreviewBridgePage = z.infer<typeof previewBridgePageSchema>
export type PreviewBridgeReaderMessage = z.infer<typeof previewBridgeReaderMessageSchema>
export type PreviewHighlightSeverity = (typeof PREVIEW_HIGHLIGHT_SEVERITIES)[number]
export type PreviewBridgeStudioMessage = z.infer<typeof previewBridgeStudioMessageSchema>
