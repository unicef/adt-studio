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
  ImageClassificationOutput,
  NodePlacement,
  PageSectioningOutput,
  PageSectioningSection,
  SectionTextSegment,
  WebRenderingOutput,
  PositionedTextOutput,
} from "@adt/types"
import { escapeHtml } from "./package-web.js"

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

/**
 * Build the inner HTML for a paragraph `<p>` from structured segments.
 *
 * Emits one styled `<span style="…">` per run; nothing more. Word-level
 * `<span id="…_wNNN">` wrappers — needed for EPUB 3 media-overlay
 * `<text src="…#…"/>` references and for in-viewer read-aloud highlighting
 * — are materialised by the consumers from `data-segments` JSON:
 *   - EPUB packaging: `wrapWordSpans` in `package-epub.ts`
 *   - Live viewer at audio playback: `wrapTextInSpans` in
 *     `assets/adt/modules/tts_highlighter.js`
 *
 * Keeping the renderer language-agnostic means a single XHTML page can be
 * re-skinned across translations (the in-studio swap rebuilds segments
 * via `rebuildSegmentedInnerHtml`) without invalidating word ids; the
 * consumers regenerate them in the target language.
 */
function renderSegmentsToHtml(
  segments: SectionTextSegment[] | undefined,
): string {
  if (!segments || segments.length === 0) return ""
  return segments
    .map((seg) => {
      const content = escapeHtml(seg.text)
      const styleStr = seg.style ? styleMapToInline(seg.style) : ""
      return styleStr ? `<span style="${styleStr}">${content}</span>` : content
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
      const { x, y, width, height } = p.bounds
      let imgStyle = `position:absolute;top:${Math.round(y)}px;left:${Math.round(x)}px;width:${Math.round(width)}px;height:${Math.round(height)}px`
      // Apply the PDF clip path captured during extraction. The `d` string is
      // in absolute viewport coords; we translate via `transform` on the
      // <path> element so the inner coords stay readable for debugging,
      // while userSpaceOnUse interprets them relative to the <img>'s box
      // (top-left origin). EPUB3 readers (Apple Books, ADE, Thorium,
      // Calibre) all support this combination.
      if (p.clipPath) {
        const clipId = `clip-${node.nodeId}`
        elements.push(
          `  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${escapeHtmlAttr(p.clipPath)}" transform="translate(${-Math.round(x)},${-Math.round(y)})"/></clipPath></defs></svg>`,
        )
        imgStyle += `;clip-path:url(#${clipId})`
      }
      // PDF blend modes (commonly Multiply in watercolor storybooks) make
      // image backgrounds composite as transparent. Reproduce via
      // `mix-blend-mode`.
      if (p.blendMode) {
        imgStyle += `;mix-blend-mode:${p.blendMode}`
      }
      if (typeof p.opacity === "number" && p.opacity < 1) {
        imgStyle += `;opacity:${p.opacity}`
      }
      elements.push(
        `  <img src="${escapeHtml(url)}" alt="" data-id="${node.nodeId}" style="${imgStyle}"/>`)
    } else if (node.role === "text") {
      if (!p?.position) continue // Reflowable text leaves shouldn't appear in fixed-layout sections; skip defensively
      const { top, lineHeight } = p.position
      // When the leaf carries a block bounds (i.e. clustering ran and
      // identified the visual container), render the paragraph spanning
      // the full block width with the inferred text-align — this lets a
      // translation re-flow inside the original bubble. Without
      // blockBounds (legacy data), fall back to single-line legacy
      // behaviour (anchor at the line's own left, no width constraint).
      const renderLeft = p.blockBounds ? Math.round(p.blockBounds.x) : p.position.left
      // When we have block geometry, pin the paragraph to the full block
      // box (width + height) and tag it with data-adt-fit so the runtime
      // auto-fit script can shrink letter-spacing/font-size to make the
      // text actually fit. We deliberately leave overflow visible: cases
      // we haven't characterised should overflow visibly so they're easy
      // to spot rather than getting silently clipped. The auto-fit
      // script's fits() check uses scrollHeight/scrollWidth which work
      // regardless of overflow setting.
      const widthRule = p.blockBounds ? `;width:${Math.round(p.blockBounds.width)}px` : ""
      // renderHeight is stamped at sectioning when multiple leaves share
      // a block (each gets its own slice of the block height); for blocks
      // with a single leaf the full blockBounds.height is correct.
      const heightValue = p.blockBounds
        ? p.renderHeight !== undefined ? p.renderHeight : p.blockBounds.height
        : undefined
      const heightRule = heightValue !== undefined ? `;height:${Math.round(heightValue)}px` : ""
      const alignRule = p.textAlign ? `;text-align:${p.textAlign}` : ""
      // line-height needs to fit the LARGEST segment's font-size, not
      // just mupdf's reported lineHeight (which it computes from the
      // first/dominant run). Without this, mixed-size paragraphs like
      // "Remember the warning signs." (11.5px body + 24px decorative)
      // overflow their 12px line box and the auto-fit's blanket scale
      // produces uneven results. Use the biggest segment fontSize when
      // segments mix sizes; fall back to the leaf's lineHeight otherwise.
      const effectiveLineHeight = pickEffectiveLineHeight(p.segments, lineHeight)
      const style = `position:absolute;top:${top}px;left:${renderLeft}px;line-height:${effectiveLineHeight}px${widthRule}${heightRule}${alignRule}`

      const segments = p.segments
      const content = renderSegmentsToHtml(segments) || escapeHtml(node.text ?? "")

      // `data-segments` carries the structured styling inline so the viewer
      // can rebuild the styled span structure after any text swap (language
      // switch, inline edit) without losing font / colour / size / stroke.
      const segmentsAttr = segments && segments.length > 0
        ? ` data-segments="${escapeHtmlAttr(JSON.stringify(segments))}"`
        : ""
      const fitAttr = p.blockBounds ? ` data-adt-fit="1"` : ""
      elements.push(
        `  <p data-id="${node.nodeId}"${segmentsAttr}${fitAttr} style="${style}">${content}</p>`)
    }
  }

  const hasFitTargets = elements.some((el) => el.includes("data-adt-fit=\"1\""))
  const fitScript = hasFitTargets ? `\n${FIT_SCRIPT}` : ""
  // Keep the attribute before `style` so the per-page viewport regex in
  // package-web (`/width:(\d+)px;height:(\d+)px/`) still reads the page's own
  // dimensions from the style rule, not this book-wide value.
  const refWidthAttr =
    referenceWidth !== undefined ? ` data-fl-reference-width="${Math.round(referenceWidth)}"` : ""
  const html = `<div id="content"${refWidthAttr} style="position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto;overflow:hidden">
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
