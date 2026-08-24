/**
 * Fixed-layout projection for imported ADT pages.
 *
 * A fixed-layout page exported by Studio is already in the exact shape
 * `renderFixedLayoutPage` emits: a `#content` box with an authored pixel
 * viewport, a book-wide `data-fl-reference-width`, and absolutely-positioned
 * `<img data-id>` / `<p data-id>` children whose DOM order is the draw order.
 *
 * The reflowable projection in `text-catalog.ts` deliberately unwraps `#content`
 * and rewraps its children in a generic `<section>` — correct for reflowable
 * exports, fatal here, because the fixed size, the reference width and the
 * positioning context all live on the wrapper.
 *
 * So this module projects such a page twice over:
 *
 *  - `html` keeps the whole `#content` element, sanitized. It becomes the
 *    `web-rendering` output, so the Storyboard and every packaging path see
 *    byte-identical geometry to the source export.
 *  - `nodes` + `placement` + `viewport` reconstruct the positioned tree that
 *    `sectionFixedLayoutPage` would have produced from a PDF, inverted from the
 *    inline styles and `data-segments` the exporter wrote. Stored under
 *    `fixed-layout-sectioning` (never `page-sectioning`, which keeps the
 *    semantic tree) and reached through the render-sectioning resolver, so
 *    feature regeneration and re-export read the tree that matches the HTML.
 *
 * The inversion is round-trip stable rather than bit-exact: feeding the result
 * back through `renderFixedLayoutPage` reproduces the same geometry, because
 * every rendered value we read back is a fixed point of the renderer's own
 * derivation (see `position.lineHeight` and `blockBounds.height` below).
 *
 * The tree holds only nodes that are actually drawn on the page, mirroring a
 * natively-sectioned fixed-layout book. Adapter leaves the semantic projection
 * synthesizes (e.g. a TOC heading a page never displays) stay in
 * `page-sectioning` where they belong.
 */
import { parseDocument, DomUtils } from "htmlparser2"
import type {
  ContentNodeData,
  NodePlacement,
  SectionTextSegment,
  SectionViewport,
} from "@adt/types"
import { AUTO_FIT_SCRIPT_SRC, SectionTextSegment as SectionTextSegmentSchema } from "@adt/types"
import { removeExecutableImportedMarkup } from "./text-catalog.js"

export interface ImportedFixedLayoutProjection {
  /** Sanitized `#content` element, authoritative for rendering. */
  html: string
  viewport: SectionViewport
  /** Book-wide scaling reference authored on `#content`, when present. */
  referenceWidth?: number
  /** Positioned leaves in draw order (DOM order == z-order). */
  nodes: ContentNodeData[]
  placement: Record<string, NodePlacement>
}

/** Largest page dimension we accept as an authored viewport. Generous enough
 * for a 2x-rendered A3 spread, tight enough that a garbage value can't turn
 * into a multi-gigapixel layout box downstream. */
const MAX_VIEWPORT_DIMENSION = 20_000

type TagElement = NonNullable<ReturnType<typeof DomUtils.findOne>>

function parseStyleDeclarations(style: string): Map<string, string> {
  const declarations = new Map<string, string>()
  // Split on `;` outside parentheses so `clip-path:url(#a)` and
  // `transform:translate(1,2)` survive intact.
  let depth = 0
  let start = 0
  const pieces: string[] = []
  for (let index = 0; index < style.length; index++) {
    const character = style[index]
    if (character === "(") depth++
    else if (character === ")") depth = Math.max(0, depth - 1)
    else if (character === ";" && depth === 0) {
      pieces.push(style.slice(start, index))
      start = index + 1
    }
  }
  pieces.push(style.slice(start))
  for (const piece of pieces) {
    const separator = piece.indexOf(":")
    if (separator === -1) continue
    const name = piece.slice(0, separator).trim().toLowerCase()
    const value = piece.slice(separator + 1).trim()
    if (name) declarations.set(name, value)
  }
  return declarations
}

function pixelValue(value: string | undefined): number | null {
  if (value === undefined) return null
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/)
  if (!match) return null
  const parsed = Number.parseFloat(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function positiveDimension(value: number | null): number | null {
  // Guard finiteness first: NaN compares false against every bound, so an
  // unparseable dimension would otherwise pass straight through as NaN.
  if (value === null || !Number.isFinite(value)) return null
  if (value <= 0 || value > MAX_VIEWPORT_DIMENSION) return null
  return value
}

/** Viewport authored on `#content`, falling back to the page's viewport meta.
 * Both are written by the exporter from the same numbers; the meta is the
 * fallback because a hand-edited page is likelier to keep the visible box. */
function resolveViewport(
  contentStyle: Map<string, string>,
  documentChildren: ReturnType<typeof parseDocument>["children"],
): SectionViewport | null {
  const width = positiveDimension(pixelValue(contentStyle.get("width")))
  const height = positiveDimension(pixelValue(contentStyle.get("height")))
  if (width !== null && height !== null) return { width, height }

  const meta = DomUtils.findOne(
    (element) => element.type === "tag"
      && element.name === "meta"
      && (element.attribs?.name ?? "").toLowerCase() === "viewport",
    documentChildren,
    true,
  )
  const content = meta?.attribs?.content ?? ""
  const metaWidth = positiveDimension(numberFromViewportMeta(content, "width"))
  const metaHeight = positiveDimension(numberFromViewportMeta(content, "height"))
  if (metaWidth !== null && metaHeight !== null) return { width: metaWidth, height: metaHeight }
  return null
}

function numberFromViewportMeta(content: string, key: "width" | "height"): number | null {
  const match = content.match(new RegExp(`\\b${key}\\s*=\\s*(\\d+(?:\\.\\d+)?)`, "i"))
  if (!match) return null
  const parsed = Number.parseFloat(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

/** Recover the PDF clip path for an image from the `<clipPath>` the renderer
 * emitted as a sibling. `d` is stored in absolute viewport coordinates and the
 * `transform` only translates it into the image's box, so reading `d` back is
 * lossless. */
function clipPathFor(nodeId: string, contentRoot: TagElement): string | undefined {
  const clip = DomUtils.findOne(
    (element) => element.type === "tag"
      && (element.name ?? "").toLowerCase() === "clippath"
      && element.attribs?.id === `clip-${nodeId}`,
    contentRoot.children ?? [],
    true,
  )
  if (!clip) return undefined
  const path = DomUtils.findOne(
    (element) => element.type === "tag" && (element.name ?? "").toLowerCase() === "path",
    clip.children ?? [],
    true,
  )
  const definition = path?.attribs?.d?.trim()
  return definition ? definition : undefined
}

function parseSegments(raw: string | undefined): SectionTextSegment[] | undefined {
  if (!raw) return undefined
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  const parsed = SectionTextSegmentSchema.array().safeParse(value)
  if (!parsed.success || parsed.data.length === 0) return undefined
  return parsed.data
}

function imagePlacement(
  declarations: Map<string, string>,
  nodeId: string,
  contentRoot: TagElement,
): NodePlacement | null {
  const left = pixelValue(declarations.get("left"))
  const top = pixelValue(declarations.get("top"))
  const width = positiveDimension(pixelValue(declarations.get("width")))
  const height = positiveDimension(pixelValue(declarations.get("height")))
  if (left === null || top === null || width === null || height === null) return null

  const clipPath = /^url\(#clip-/.test(declarations.get("clip-path") ?? "")
    ? clipPathFor(nodeId, contentRoot)
    : undefined
  const blendMode = declarations.get("mix-blend-mode")
  const rawOpacity = declarations.get("opacity")
  const opacity = rawOpacity !== undefined ? Number.parseFloat(rawOpacity) : Number.NaN

  return {
    bounds: { x: left, y: top, width, height },
    ...(clipPath ? { clipPath } : {}),
    ...(blendMode && /^[a-z-]+$/.test(blendMode) ? { blendMode } : {}),
    ...(Number.isFinite(opacity) && opacity >= 0 && opacity < 1 ? { opacity } : {}),
  }
}

function textPlacement(
  declarations: Map<string, string>,
  segments: SectionTextSegment[] | undefined,
): NodePlacement | null {
  const left = pixelValue(declarations.get("left"))
  const top = pixelValue(declarations.get("top"))
  const lineHeight = positiveDimension(pixelValue(declarations.get("line-height")))
  if (left === null || top === null || lineHeight === null) return null

  const width = positiveDimension(pixelValue(declarations.get("width")))
  const height = positiveDimension(pixelValue(declarations.get("height")))
  const textAlign = declarations.get("text-align")

  return {
    // The rendered `line-height` is already `max(authored lineHeight, largest
    // segment font-size)`, and the rendered `height` is already the leaf's own
    // slice of its block — so reading both back and storing them plainly makes
    // the renderer's derivations idempotent on the next pass.
    position: { top, left, lineHeight },
    ...(segments ? { segments } : {}),
    // `blockBounds` is what makes the renderer pin the paragraph to a box and
    // tag it for auto-fit, so it is present exactly when the export carried a
    // width and height for the paragraph.
    ...(width !== null && height !== null
      ? { blockBounds: { x: left, y: top, width, height } }
      : {}),
    ...(textAlign === "center" || textAlign === "right" ? { textAlign } : {}),
  }
}

function leafText(element: TagElement, segments: SectionTextSegment[] | undefined): string {
  if (segments) return segments.map((segment) => segment.text).join("")
  return DomUtils.textContent(element)
}

/**
 * Project one exported ADT page as a fixed-layout page, or return `null` when
 * the page is reflowable and belongs on the ordinary import path. A fixed-layout
 * book can legitimately mix the two — Studio exports generated quiz pages as
 * reflowable activity pages even in a fixed-layout book — so detection is
 * per page, never per book.
 */
export function projectImportedFixedLayoutPage(
  html: string,
  imageUrlPrefix?: string,
): ImportedFixedLayoutProjection | null {
  const doc = parseDocument(html)
  const contentRoot = DomUtils.findOne(
    (element) => element.type === "tag" && element.attribs?.id === "content",
    doc.children,
    true,
  )
  if (!contentRoot) return null

  // Sanitize before measuring: a style attribute carrying an `expression()` is
  // dropped here, and a viewport read from a dropped attribute would describe a
  // box the rendered HTML no longer has.
  removeExecutableImportedMarkup(contentRoot)

  const viewport = resolveViewport(
    parseStyleDeclarations(contentRoot.attribs.style ?? ""),
    doc.children,
  )
  if (!viewport) return null

  const leaves = DomUtils.findAll(
    (element) => element.type === "tag" && element.attribs?.["data-id"] !== undefined,
    contentRoot.children ?? [],
  )

  const nodes: ContentNodeData[] = []
  const placement: Record<string, NodePlacement> = {}
  const seen = new Set<string>()
  for (const element of leaves) {
    const nodeId = element.attribs["data-id"]?.trim()
    if (!nodeId || seen.has(nodeId)) continue
    const declarations = parseStyleDeclarations(element.attribs.style ?? "")
    if (declarations.get("position") !== "absolute") continue

    if ((element.name ?? "").toLowerCase() === "img") {
      const resolved = imagePlacement(declarations, nodeId, contentRoot)
      if (!resolved) continue
      seen.add(nodeId)
      nodes.push({ nodeId, role: "image", isPruned: false })
      placement[nodeId] = resolved
      if (imageUrlPrefix) {
        element.attribs.src = `${imageUrlPrefix}/${encodeURIComponent(nodeId)}`
      }
      continue
    }

    const segments = parseSegments(element.attribs["data-segments"])
    const resolved = textPlacement(declarations, segments)
    if (!resolved) continue
    seen.add(nodeId)
    nodes.push({ nodeId, role: "text", isPruned: false, text: leafText(element, segments) })
    placement[nodeId] = resolved
  }

  // A `#content` box with an authored viewport but nothing positioned inside it
  // is not a fixed-layout page — it is a reflowable page that happens to carry
  // dimensions. Let the ordinary import path have it.
  if (nodes.length === 0) return null

  // The exporter's own auto-fit script was stripped along with every other
  // imported script. Re-attach ADT Studio's copy, exactly as the native
  // renderer does, so pinned paragraphs still shrink to fit their block.
  if (Object.values(placement).some((entry) => entry.blockBounds !== undefined)) {
    DomUtils.appendChild(contentRoot, parseDocument(
      `<script src="${AUTO_FIT_SCRIPT_SRC}"></script>`,
    ).children[0])
  }

  const referenceWidth = Number.parseFloat(contentRoot.attribs["data-fl-reference-width"] ?? "")


  return {
    html: DomUtils.getOuterHTML(contentRoot),
    viewport,
    ...(positiveDimension(referenceWidth) !== null ? { referenceWidth } : {}),
    nodes,
    placement,
  }
}

/**
 * Whether an exported page is fixed-layout. Single definition of the question,
 * so the round-trip contract inspector, the exported manifest's data-id list and
 * the import projection can never disagree about which pages are positioned.
 */
export function isImportedFixedLayoutPage(html: string): boolean {
  return projectImportedFixedLayoutPage(html) !== null
}
