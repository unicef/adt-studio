/**
 * Fixed-Layout Rendering
 *
 * Produces fixed-layout HTML pages for illustrated storybooks. Uses
 * extracted illustration images as backgrounds with visible, styled
 * positioned text from mupdf's asHTML() output.
 *
 * Sectioning emits a regular `PageSectioningOutput` (tree of `ContentNodeData`
 * leaves) plus a `placement` sidecar carrying the PDF coordinates, segment
 * styling, blockBounds, etc. on `PageSectioningSection.placement[nodeId]`. It is
 * stored in the dedicated `fixed-layout-sectioning` node (NOT `page-sectioning`,
 * which always holds the semantic tree) and reached via the render-sectioning
 * resolver. Downstream steps (text-catalog, TTS, packageAdtWeb) walk the tree
 * and ignore placement.
 */

import type { Storage } from "@adt/storage"
import type {
  AppConfig,
  ContentNodeData,
  DrawItem,
  FixedLayoutUserStyles,
  ImageClassificationOutput,
  NodePlacement,
  PageSectioningOutput,
  PageSectioningSection,
  SectionTextSegment,
  WebRenderingOutput,
  PositionedTextOutput,
} from "@adt/types"
import {
  FixedLayoutUserStyles as FixedLayoutUserStylesSchema,
  PageSectioningOutput as PageSectioningOutputSchema,
  fontFamilyClass,
} from "@adt/types"
import { escapeHtml } from "./package-web.js"

export const FIXED_LAYOUT_USER_STYLES_NODE = "fixed-layout-user-styles"

export function applyUserStyles(
  sectioning: PageSectioningOutput,
  userStyles: FixedLayoutUserStyles,
): void {
  for (const section of sectioning.sections) {
    if (!section.placement) continue
    for (const [nodeId, p] of Object.entries(section.placement)) {
      const styles = userStyles.nodes[nodeId]
      const legacyClasses = styles?.styleOverrides ? styleMapToClasses(styles.styleOverrides) : []
      const classes = [...legacyClasses, ...(styles?.classes ?? [])]
      if (classes.length > 0) p.classes = classes
      else delete p.classes
      delete p.styleOverrides
      if (styles) delete styles.styleOverrides
    }
  }
}

/**
 * Whether the book should render as a fixed-layout EPUB.
 *
 * True if any section type resolves to a `fixed_layout`-typed render strategy.
 * When any section is fixed-layout the whole book renders fixed-layout
 * (consistent with the BookFusion reader's homogeneous-layout requirement;
 * the EPUB spec allows mixed per-itemref but many readers don't support it
 * cleanly).
 */
export function isFixedLayoutBook(config: AppConfig): boolean {
  const strategies = config.render_strategies ?? {}
  const candidateNames = new Set<string>()
  if (config.default_render_strategy) candidateNames.add(config.default_render_strategy)
  for (const name of Object.values(config.section_render_strategies ?? {})) {
    candidateNames.add(name)
  }
  for (const name of candidateNames) {
    if (strategies[name]?.render_type === "fixed_layout") return true
  }
  return false
}

// ── Fixed-Layout Page Sectioning ───────────────────────────────────

/**
 * Input shape for building a fixed-layout section. `drawItems` is the
 * authoritative draw sequence from extraction — array order IS z-order.
 * Image items are kept only when their `imageId` is in `availableImageIds`
 * (i.e. the image survived image-filtering).
 */
export interface FixedLayoutSectionInput {
  pageId: string
  pageNumber: number
  viewport: { width: number; height: number }
  drawItems: DrawItem[]
  /**
   * Set of imageIds that passed image-filtering. Image draw-items whose
   * imageId isn't in this set are dropped from the section.
   */
  availableImageIds: Set<string>
}

/**
 * Produce a `PageSectioningOutput` for a fixed-layout page. The section's
 * `nodes` array mirrors `drawItems` order — each kept image becomes a
 * `role: "image"` leaf, each paragraph becomes a `role: "text"` leaf.
 * Wrapped lines that share a `mergedParagraphId` are collapsed into a
 * single text leaf with concatenated text + segments. Sentence boundaries
 * inside the same speech bubble keep separate leaves.
 *
 * PDF coordinates, segment styling, blockBounds, blend/clip metadata, etc.
 * live on `section.placement[nodeId]` (out-of-band) so the tree itself
 * stays a clean semantic structure that downstream tree-walkers
 * (text-catalog, validators) can process unchanged.
 */
export function sectionFixedLayoutPage(
  input: FixedLayoutSectionInput,
): PageSectioningOutput {
  const { pageId, pageNumber, viewport, drawItems, availableImageIds } = input

  const nodes: ContentNodeData[] = []
  const placement: Record<string, NodePlacement> = {}
  // State for the in-flight merge: the leaf we'd append to, its placement
  // (mutable; same reference stored in `placement`), the merged-id of its
  // trailing line, and that line's original text — we read the trailing
  // text to decide hyphen vs. space joining.
  let lastLeaf: ContentNodeData | null = null
  let lastLeafPlacement: NodePlacement | null = null
  let lastMergedId: string | undefined
  let lastItemText: string | null = null

  for (const item of drawItems) {
    if (item.kind === "image") {
      // An image breaks any in-flight text merge — even if the next text
      // shares an id, appending past the image would reorder DOM.
      lastLeaf = null
      lastLeafPlacement = null
      lastMergedId = undefined
      lastItemText = null
      if (!availableImageIds.has(item.imageId)) continue
      nodes.push({
        nodeId: item.imageId,
        role: "image",
        isPruned: false,
      })
      placement[item.imageId] = {
        bounds: item.bounds,
        ...(item.clipPath ? { clipPath: item.clipPath } : {}),
        ...(item.blendMode ? { blendMode: item.blendMode } : {}),
        ...(typeof item.opacity === "number" ? { opacity: item.opacity } : {}),
      }
      continue
    }

    const canMerge =
      lastLeaf !== null &&
      lastLeafPlacement !== null &&
      lastItemText !== null &&
      item.mergedParagraphId !== undefined &&
      item.mergedParagraphId === lastMergedId
    if (canMerge && lastLeaf && lastLeafPlacement && lastItemText !== null) {
      appendContinuationLine(lastLeaf, lastLeafPlacement, item, lastItemText)
      lastItemText = item.text
      continue
    }

    const leaf: ContentNodeData = {
      nodeId: item.textId,
      role: "text",
      isPruned: false,
      text: item.text,
    }
    const leafPlacement: NodePlacement = {
      position: {
        top: Math.round(item.top),
        left: Math.round(item.left),
        lineHeight: Math.round(item.lineHeight),
      },
      ...(item.segments !== undefined ? { segments: item.segments } : {}),
      ...(item.blockId !== undefined ? { blockId: item.blockId } : {}),
      ...(item.blockBounds !== undefined ? { blockBounds: item.blockBounds } : {}),
      ...(item.textAlign !== undefined ? { textAlign: item.textAlign } : {}),
    }
    nodes.push(leaf)
    placement[item.textId] = leafPlacement
    lastLeaf = leaf
    lastLeafPlacement = leafPlacement
    lastMergedId = item.mergedParagraphId
    lastItemText = item.text
  }

  // Slice each block's height across the leaves that share it. Without
  // this, multiple absolutely-positioned <p>s in one block all use the
  // full block height (blockBounds.height) and stack with overlapping
  // boxes — e.g. "LISTEN. PREPARE." and "STAY AWARE!" in the same
  // bubble both get height:55, but their tops are 25 apart, so a 30 px
  // overlap covers the second paragraph's content.
  const byBlock = new Map<string, NodePlacement[]>()
  for (const node of nodes) {
    if (node.role !== "text") continue
    const p = placement[node.nodeId]
    if (!p?.blockId || !p.blockBounds || !p.position) continue
    const list = byBlock.get(p.blockId)
    if (list) list.push(p)
    else byBlock.set(p.blockId, [p])
  }
  for (const list of byBlock.values()) {
    if (list.length < 2) continue // single leaf — full blockBounds.height is correct.
    list.sort((a, b) => a.position!.top - b.position!.top)
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]
      const next = list[i + 1]
      const top = cur.position!.top
      const bottom = next ? next.position!.top : cur.blockBounds!.y + cur.blockBounds!.height
      // Floor at one lineHeight so degenerate slices still hold a line of
      // text. The auto-fit script tolerates the ~0.2× per-line glyph
      // overhead between scrollHeight and clientHeight, so we don't need
      // to over-allocate the layout box here.
      cur.renderHeight = Math.max(bottom - top, cur.position!.lineHeight)
    }
  }

  const section: PageSectioningSection = {
    sectionId: `${pageId}_sec001`,
    sectionType: "fixed-layout-page",
    nodes,
    placement,
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber,
    isPruned: false,
    viewport,
  }

  return {
    reasoning: "Fixed-layout mode: entire page is a single section; nodes are in PDF draw-sequence order so z-stacking is preserved by HTML DOM order. Wrapped lines that the continuation heuristic identified as one logical paragraph are collapsed into a single text leaf.",
    sections: [section],
  }
}

/**
 * Append a continuation line to an existing text leaf. `prevLineText` is
 * the untouched text of the line that ends the leaf — we test its tail
 * for a hyphen to choose between hyphen-join (no separator, drop the
 * boundary whitespace) and word-wrap join (single space between).
 *
 * Mutates `leaf.text` and `placement.segments` in place.
 */
function appendContinuationLine(
  leaf: ContentNodeData,
  placement: NodePlacement,
  item: { text: string; segments?: SectionTextSegment[] },
  prevLineText: string,
): void {
  const hyphenJoin = prevLineText.endsWith("-")
  const currentText = leaf.text ?? ""

  if (hyphenJoin) {
    leaf.text = currentText.replace(/\s+$/, "") + item.text.replace(/^\s+/, "")
    if (placement.segments && placement.segments.length > 0) {
      const lastIdx = placement.segments.length - 1
      placement.segments[lastIdx] = {
        ...placement.segments[lastIdx],
        text: placement.segments[lastIdx].text.replace(/\s+$/, ""),
      }
    }
    if (item.segments && item.segments.length > 0) {
      const trimmedFirst = {
        ...item.segments[0],
        text: item.segments[0].text.replace(/^\s+/, ""),
      }
      placement.segments = [...(placement.segments ?? []), trimmedFirst, ...item.segments.slice(1)]
    }
    return
  }

  // Word-wrap join: ensure exactly one space between the two lines. PDF
  // lines often already have a trailing space on prev or a leading space
  // on current; only insert one if neither side carries it.
  const prevHasTrailing = /\s$/.test(currentText)
  const currHasLeading = /^\s/.test(item.text)
  const needsSpace = !prevHasTrailing && !currHasLeading

  leaf.text = currentText + (needsSpace ? " " : "") + item.text
  if (needsSpace && placement.segments && placement.segments.length > 0) {
    const lastIdx = placement.segments.length - 1
    placement.segments[lastIdx] = {
      ...placement.segments[lastIdx],
      text: placement.segments[lastIdx].text + " ",
    }
  }
  if (item.segments) {
    placement.segments = [...(placement.segments ?? []), ...item.segments]
  }
}

function renderSegmentsToHtml(
  segments: SectionTextSegment[] | undefined,
  inheritedSpanClasses: string[] = [],
): string {
  if (!segments || segments.length === 0) return ""
  return segments
    .map((seg) => {
      const content = escapeHtml(seg.text)
      const classes = [...(seg.style ? styleMapToClasses(seg.style) : []), ...inheritedSpanClasses]
      return classes.length > 0
        ? `<span class="${classes.join(" ")}">${content}</span>`
        : content
    })
    .join("")
}

/**
 * Serialize a `data-segments` style map to an inline-style string with the
 * bundled-font fallback applied to `font-family`. Exported so EPUB
 * packaging (`package-epub.ts:wrapBySegments`) renders the same styled
 * spans the in-studio viewer does.
 */
export function styleMapToInline(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([k, v]) => `${k}:${k === "font-family" ? withBundledFallback(v) : v}`)
    .join(";")
}

export function styleMapToClasses(style: Record<string, string>): string[] {
  const classes: string[] = []
  for (const [prop, raw] of Object.entries(style)) {
    const value = raw.trim()
    if (!value) continue
    switch (prop) {
      case "font-family":
        classes.push(fontFamilyClass(withBundledFallback(value)))
        break
      case "font-size":
        classes.push(`text-[${cssArbitraryValue(value)}]`)
        break
      case "color":
        classes.push(`text-[${cssArbitraryValue(value)}]`)
        break
      case "font-weight":
        classes.push(fontWeightToClass(value))
        break
      case "font-style":
        classes.push(
          value === "italic"
            ? "italic"
            : value === "normal"
              ? "not-italic"
              : `[font-style:${cssArbitraryValue(value)}]`,
        )
        break
      case "letter-spacing":
        classes.push(`tracking-[${cssArbitraryValue(value)}]`)
        break
      default:
        classes.push(`[${prop}:${cssArbitraryValue(value)}]`)
    }
  }
  return classes
}

const FONT_WEIGHT_KEYWORD_CLASS: Record<string, string> = {
  "100": "font-thin",
  "200": "font-extralight",
  "300": "font-light",
  "400": "font-normal",
  normal: "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  bold: "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
}

function fontWeightToClass(value: string): string {
  return FONT_WEIGHT_KEYWORD_CLASS[value] ?? `font-[${cssArbitraryValue(value)}]`
}

function cssArbitraryValue(value: string): string {
  return value.replace(/_/g, "\\_").replace(/\s+/g, "_")
}

/**
 * Append `Merriweather` to a font-family chain so spans whose declared
 * fonts (MuseoSans, Chokle, etc.) aren't bundled fall back to the
 * actually-loaded Merriweather instead of system `serif`. Without this
 * fallback, `document.fonts.ready` resolves immediately because no
 * declared face is loading, and the auto-fit script then measures
 * against system Times — giving widely different metrics than the
 * source PDF, which causes over-shrinking.
 *
 * Already includes Merriweather (case-insensitive) → unchanged.
 * Generic family terminator (serif/sans-serif/monospace/etc.) → insert
 * Merriweather just before it. No generic terminator → append both.
 */
function withBundledFallback(fontFamily: string): string {
  if (/\bmerriweather\b/i.test(fontFamily)) return fontFamily
  const generics = /\b(serif|sans-serif|monospace|cursive|fantasy|system-ui)\b/i
  const m = fontFamily.match(generics)
  if (m) {
    const idx = fontFamily.toLowerCase().lastIndexOf(m[0].toLowerCase())
    return fontFamily.slice(0, idx) + "Merriweather," + fontFamily.slice(idx)
  }
  return fontFamily.replace(/\s*$/, "") + ",Merriweather,serif"
}

const NATIVE_BLEND_MODES = new Set([
  "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "color-burn", "hard-light", "soft-light", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity", "normal",
])

function hasVariantPrefix(cls: string): boolean {
  const colon = cls.indexOf(":")
  if (colon === -1) return false
  const bracket = cls.indexOf("[")
  return bracket === -1 || colon < bracket
}

export function classPropertyGroup(cls: string): string | null {
  if (hasVariantPrefix(cls)) return null
  if (/^(absolute|relative|static|fixed|sticky)$/.test(cls)) return "position"
  if (/^-?top-/.test(cls)) return "top"
  if (/^-?left-/.test(cls)) return "left"
  if (/^max-w-/.test(cls)) return "max-width"
  if (/^w-/.test(cls)) return "width"
  if (/^h-/.test(cls)) return "height"
  if (/^leading-/.test(cls)) return "line-height"
  if (/^text-(left|center|right|justify|start|end)$/.test(cls)) return "text-align"
  if (/^text-(xs|sm|base|lg|xl|\dxl)$/.test(cls)) return "font-size"
  if (/^text-\[[\d.]+(px|rem|em|%)\]$/.test(cls)) return "font-size"
  if (/^text-/.test(cls)) return "color"
  if (/^font-(sans|serif|mono)$/.test(cls) || /^font-\[/.test(cls)) return "font-family"
  if (/^font-/.test(cls)) return "font-weight"
  if (/^tracking-/.test(cls)) return "letter-spacing"
  if (/^(italic|not-italic)$/.test(cls)) return "font-style"
  if (/^opacity-/.test(cls)) return "opacity"
  if (/^mix-blend-/.test(cls) || /^\[mix-blend-mode:/.test(cls)) return "mix-blend-mode"
  return null
}

const INHERITABLE_GROUPS: Record<string, string> = {
  "font-size": "font-size",
  "color": "color",
  "font-family": "font-family",
  "font-weight": "font-weight",
  "letter-spacing": "letter-spacing",
  "font-style": "font-style",
}

export function generatedTextLeafClasses(p: NodePlacement): string[] {
  if (!p.position) return []
  const renderLeft = p.blockBounds ? Math.round(p.blockBounds.x) : p.position.left
  const effectiveLineHeight = pickEffectiveLineHeight(p.segments, p.position.lineHeight)
  const classes = [
    "absolute",
    `top-[${p.position.top}px]`,
    `left-[${renderLeft}px]`,
    `leading-[${effectiveLineHeight}px]`,
  ]
  if (p.blockBounds) {
    classes.push(`w-[${Math.round(p.blockBounds.width)}px]`)
    const heightValue = p.renderHeight !== undefined ? p.renderHeight : p.blockBounds.height
    classes.push(`h-[${Math.round(heightValue)}px]`)
  }
  if (p.textAlign) classes.push(`text-${p.textAlign}`)
  return classes
}

export function generatedImageLeafClasses(p: NodePlacement): string[] {
  if (!p.bounds) return []
  const { x, y, width, height } = p.bounds
  const classes = [
    "absolute",
    "max-w-none",
    `top-[${Math.round(y)}px]`,
    `left-[${Math.round(x)}px]`,
    `w-[${Math.round(width)}px]`,
    `h-[${Math.round(height)}px]`,
  ]
  if (p.blendMode && p.blendMode !== "normal") {
    classes.push(
      NATIVE_BLEND_MODES.has(p.blendMode)
        ? `mix-blend-${p.blendMode}`
        : `[mix-blend-mode:${p.blendMode}]`,
    )
  }
  if (typeof p.opacity === "number" && p.opacity < 1) {
    classes.push(`opacity-[${p.opacity}]`)
  }
  return classes
}

function mergeLeafClasses(generated: string[], user: string[] | undefined): string[] {
  if (!user || user.length === 0) return generated
  const userGroups = new Set(
    user.map(classPropertyGroup).filter((g): g is string => g !== null),
  )
  const kept = generated.filter((c) => {
    const group = classPropertyGroup(c)
    return group === null || !userGroups.has(group)
  })
  const merged = [...kept]
  for (const cls of user) if (!merged.includes(cls)) merged.push(cls)
  return merged
}

function userOverriddenInheritableProps(p: NodePlacement): Set<string> {
  const props = new Set<string>()
  for (const cls of placementUserClasses(p)) {
    const group = classPropertyGroup(cls)
    if (group && INHERITABLE_GROUPS[group]) props.add(INHERITABLE_GROUPS[group])
  }
  return props
}

function stripOverriddenSegmentProps(
  segments: SectionTextSegment[] | undefined,
  overridden: Set<string>,
): SectionTextSegment[] | undefined {
  if (!segments || overridden.size === 0) return segments
  return segments.map((seg) => {
    if (!seg.style) return seg
    const entries = Object.entries(seg.style).filter(([k]) => !overridden.has(k))
    if (entries.length === Object.keys(seg.style).length) return seg
    if (entries.length === 0) {
      const { style: _style, ...rest } = seg
      return rest
    }
    return { ...seg, style: Object.fromEntries(entries) }
  })
}

function placementUserClasses(p: NodePlacement): string[] {
  return [...styleMapToClasses(p.styleOverrides ?? {}), ...(p.classes ?? [])]
}

function fontFamilyClasses(classes: string[]): string[] {
  return classes.filter((cls) => {
    if (cls.startsWith("[&_span]:")) return false
    return classPropertyGroup(cls) === "font-family"
  })
}

// ── Fixed-Layout Web Rendering ─────────────────────────────────────

/**
 * Produce fixed-layout HTML from a pre-built `PageSectioningSection`.
 * Walks the section's `nodes` tree (image and text leaves) and looks up
 * placement metadata in `section.placement[nodeId]`. Downstream edit /
 * translation flows can mutate node text + placement and re-call this to
 * get a correctly-positioned HTML output.
 */
export function renderFixedLayoutPage(
  section: PageSectioningSection,
  imageUrlPrefix: string,
  /**
   * Book-wide reference width — the widest page in the book (a full spread in
   * spread mode). When provided, it's stamped onto `#content` as
   * `data-fl-reference-width` so viewers scale every page by the SAME factor
   * (availableWidth / referenceWidth) instead of each page's own width. A
   * single page (cover/end, half a spread's width) then renders centered at
   * half the panel width — the same apparent page size as one half of a
   * spread — rather than being upscaled 2× to fill the panel. Omitted in
   * unit tests / ad-hoc renders, where viewers fall back to per-page width.
   */
  referenceWidth?: number,
): WebRenderingOutput {
  const viewport = section.viewport
  if (!viewport) {
    throw new Error(
      `Fixed-layout section ${section.sectionId} is missing viewport dimensions`,
    )
  }
  const placement = section.placement ?? {}

  // Emit every drawable leaf (image or text) as a direct sibling of
  // `#content`, in section-node order. Tree order = PDF draw order = HTML
  // DOM order = z-stacking, so later items naturally appear on top.
  const elements: string[] = []
  for (const node of section.nodes) {
    if (node.isPruned) continue
    const p = placement[node.nodeId]
    if (node.role === "image") {
      if (!p?.bounds) continue
      const url = `${imageUrlPrefix}/${node.nodeId}`
      const { x, y } = p.bounds
      const classes = mergeLeafClasses(generatedImageLeafClasses(p), placementUserClasses(p))
      if (p.clipPath) {
        const clipId = `clip-${node.nodeId}`
        elements.push(
          `  <svg width="0" height="0" class="absolute" aria-hidden="true"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${escapeHtmlAttr(p.clipPath)}" transform="translate(${-Math.round(x)},${-Math.round(y)})"/></clipPath></defs></svg>`,
        )
        classes.push(`[clip-path:url(#${clipId})]`)
      }
      elements.push(
        `  <img src="${escapeHtml(url)}" alt="" data-id="${node.nodeId}" class="${classes.join(" ")}"/>`)
    } else if (node.role === "text") {
      if (!p?.position) continue // Reflowable text leaves shouldn't appear in fixed-layout sections; skip defensively
      const userClasses = placementUserClasses(p)
      const spanFontClasses = fontFamilyClasses(userClasses)
      const classes = mergeLeafClasses(generatedTextLeafClasses(p), userClasses)

      const overridden = userOverriddenInheritableProps(p)
      const segments = stripOverriddenSegmentProps(p.segments, overridden)
      const content = renderSegmentsToHtml(segments, spanFontClasses) || escapeHtml(node.text ?? "")

      // `data-segments` carries the structured styling inline so the viewer
      // can rebuild the styled span structure after any text swap (language
      // switch, inline edit) without losing font / colour / size / stroke.
      const segmentsAttr = segments && segments.length > 0
        ? ` data-segments="${escapeHtmlAttr(JSON.stringify(segments))}"`
        : ""
      const userPinnedFontSize = overridden.has("font-size")
      const fitAttr = p.blockBounds && !userPinnedFontSize ? ` data-adt-fit="1"` : ""
      elements.push(
        `  <p data-id="${node.nodeId}"${segmentsAttr}${fitAttr} class="${classes.join(" ")}">${content}</p>`)
    }
  }

  const hasFitTargets = elements.some((el) => el.includes("data-adt-fit=\"1\""))
  const fitScript = hasFitTargets ? `\n${FIT_SCRIPT}` : ""
  const width = Math.round(viewport.width)
  const height = Math.round(viewport.height)
  const refWidthAttr =
    referenceWidth !== undefined ? ` data-fl-reference-width="${Math.round(referenceWidth)}"` : ""
  const html = `<div id="content"${refWidthAttr} data-fl-width="${width}" data-fl-height="${height}" class="relative mx-auto overflow-hidden w-[${width}px] h-[${height}px]">
${elements.join("\n")}${fitScript}
</div>`

  return {
    sections: [
      {
        sectionIndex: 0,
        sectionType: "fixed-layout-page",
        reasoning: "Fixed-layout: rendered from positioned section JSON (text + image bounds).",
        html,
      },
    ],
  }
}

// ── Batch Processing ───────────────────────────────────────────────

/**
 * Run fixed-layout sectioning + rendering for all pages.
 * Stores results using the same node names as the reflowable pipeline.
 */
export function processFixedLayoutPages(
  storage: Storage,
  imageUrlPrefix: string,
): void {
  const pages = storage.getPages()
  let totalDrawItems = 0

  // Pass 1: resolve each page's viewport + inputs. We collect these up front
  // so we can compute the book-wide reference (spread) width before rendering
  // — that value must be identical on every page (see renderFixedLayoutPage).
  const prepared: Array<{
    page: (typeof pages)[number]
    viewport: { width: number; height: number }
    drawItems: DrawItem[]
    availableImageIds: Set<string>
  }> = []

  for (const page of pages) {
    // Render whatever image-filtering left unpruned. The wizard writes
    // `image_filters` values for fixed-layout books that disable size /
    // complexity / LLM-meaningfulness pruning, so in practice every
    // extracted image survives except the full-page render itself (which
    // image-filtering always prunes — using it as a background would
    // double-draw the page).
    const allImages = storage.getPageImages(page.pageId)
    const pageRender = allImages.find((img) => img.imageId.endsWith("_page"))
    const classRow = storage.getLatestNodeData("image-filtering", page.pageId)
    const classification = classRow ? (classRow.data as ImageClassificationOutput) : null
    const availableImageIds = new Set(
      classification
        ? classification.images.filter((c) => !c.isPruned).map((c) => c.imageId)
        : []
    )

    const posTextRow = storage.getLatestNodeData("positioned-text", page.pageId)
    const positionedText = posTextRow ? (posTextRow.data as PositionedTextOutput) : null

    // Viewport comes from the positioned-text extraction (authoritative PDF
    // page dimensions). Fall back to the page render's pixel size only when
    // no positioned text was extracted at all.
    const viewport = positionedText
      ? { width: Math.round(positionedText.pageWidth), height: Math.round(positionedText.pageHeight) }
      : pageRender
        ? { width: pageRender.width, height: pageRender.height }
        : null
    if (!viewport) continue

    const drawItems: DrawItem[] = positionedText?.drawItems ?? []
    totalDrawItems += drawItems.length
    prepared.push({ page, viewport, drawItems, availableImageIds })
  }

  // The widest page is the book's reference width: a full spread in spread
  // mode, or just the common page width otherwise. Stamped onto every page so
  // viewers scale uniformly and single (cover/end) pages render centered at
  // their natural fraction of the panel instead of being upscaled to fill it.
  const referenceWidth = prepared.reduce((max, p) => Math.max(max, p.viewport.width), 0)

  // Pass 2: section + render each page with the shared reference width.
  for (const { page, viewport, drawItems, availableImageIds } of prepared) {
    const sectioning = sectionFixedLayoutPage({
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      viewport,
      drawItems,
      availableImageIds,
    })
    const userStylesRow = storage.getLatestNodeData(FIXED_LAYOUT_USER_STYLES_NODE, page.pageId)
    if (userStylesRow) {
      const parsed = FixedLayoutUserStylesSchema.safeParse(userStylesRow.data)
      if (parsed.success) applyUserStyles(sectioning, parsed.data)
    }
    // Store the positioned tree under its OWN node so it never clobbers the
    // semantic `page-sectioning` (which the Sectioning view + reflowable
    // rendering rely on, and which must survive a render-strategy switch).
    storage.putNodeData("fixed-layout-sectioning", page.pageId, sectioning)

    const rendering = renderFixedLayoutPage(
      sectioning.sections[0],
      imageUrlPrefix,
      referenceWidth,
    )
    storage.putNodeData("web-rendering", page.pageId, rendering)
  }

  // Positioned text is produced by the Extract stage only when the book is
  // configured fixed-layout. A fixed-layout book with no positioned text on
  // ANY page almost always means extraction ran under a reflowable config
  // (e.g. the render strategy was switched after extracting). Re-running the
  // Extract stage regenerates it; warn loudly so the empty overlays aren't
  // mistaken for a rendering bug.
  if (pages.length > 0 && totalDrawItems === 0) {
    console.warn(
      "[fixed-layout] No positioned text found on any page — fixed-layout " +
        "pages will render without text overlays. Re-run the Extract stage " +
        "for this book (positioned text is only generated when the book is " +
        "configured for fixed-layout rendering)."
    )
  }
}

export function getFixedLayoutReferenceWidth(storage: Storage): number | undefined {
  let max = 0
  for (const page of storage.getPages()) {
    const row = storage.getLatestNodeData("fixed-layout-sectioning", page.pageId)
    if (!row) continue
    const parsed = PageSectioningOutputSchema.safeParse(row.data)
    if (!parsed.success) continue
    for (const section of parsed.data.sections) {
      if (section.viewport && section.viewport.width > max) max = section.viewport.width
    }
  }
  return max > 0 ? max : undefined
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Escape a JSON string for embedding inside a double-quoted HTML attribute.
 * `&` and `"` are entity-encoded; browsers decode them when calling
 * `.getAttribute()`, so `JSON.parse(el.getAttribute("data-segments"))` works.
 */
function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

/**
 * Pick the line-height to apply on the paragraph `<p>`. mupdf's
 * `position.lineHeight` is the line-height of the first/dominant
 * run on that line, which is wrong for mixed-size paragraphs — a 24 px
 * decorative segment inside an 11.5 px body line gets clipped/overflows
 * the 12 px line box.
 *
 * Strategy: take the largest segment font-size when (a) segments are
 * present and (b) at least one segment exceeds the fallback. Single-size
 * segments and segments-without-fontSize fall through to `fallbackLineHeight`.
 */
function pickEffectiveLineHeight(
  segments: SectionTextSegment[] | undefined,
  fallbackLineHeight: number,
): number {
  if (!segments || segments.length === 0) return fallbackLineHeight
  let maxFontSize = 0
  for (const seg of segments) {
    const fsRaw = seg.style?.["font-size"]
    if (!fsRaw) continue
    const fs = parseFloat(fsRaw)
    if (!Number.isFinite(fs) || fs <= 0) continue
    if (fs > maxFontSize) maxFontSize = fs
  }
  if (maxFontSize <= fallbackLineHeight) return fallbackLineHeight
  return maxFontSize
}

/**
 * `<script src>` reference to the shared auto-fit script. The actual
 * logic lives in `assets/adt/auto-fit.js` so the same file is used in
 * both packaged-book pages (loaded by URL) and the studio storyboard
 * preview (loaded by URL into the iframe shell). Keeping a single
 * source of truth avoids the drift we ran into with two inline copies.
 */
const FIT_SCRIPT = `<script src="./assets/auto-fit.js"></script>`
