/**
 * Page stream recorder — records every drawing operation a PDF page emits in
 * the order they appear in the content stream.
 *
 * mupdf's StructuredText walker reorders blocks for reading flow, which loses
 * the original z-order. The SVG output preserves draw order but mixes glyph
 * paths with vector paths and renders text into post-pass `<text>` blocks.
 * Neither is a clean source of stream-order data for our needs.
 *
 * Instead we run the page through a custom `Device` via `Page.run`. mupdf
 * invokes our callbacks once per content-stream operator, in stream order,
 * with the fully-resolved CTM. That gives us authoritative z-order with
 * per-op clip stack visibility — the canonical PDF imaging model.
 *
 * The recorder is page-scoped and stateless across pages: callers run it
 * once per page and consume the resulting `StreamOp[]`.
 */
import { createHash } from "node:crypto"
import mupdf, {
  type BlendMode,
  type Color,
  type ColorSpace,
  type Document as MupdfDocument,
  type Image as MupdfImage,
  type Matrix as MupdfMatrix,
  type StrokeState,
} from "mupdf"
import { colorToCss } from "./color-utils.js"

// mupdf's path/text getBounds() typings require a StrokeState, but the
// runtime accepts null for unstroked-bound queries. Cast at call sites.
const NO_STROKE = null as unknown as StrokeState

/** Axis-aligned bounding box in PDF user space (y-up, bottom-left origin). */
export interface BBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Single glyph emission with its baseline origin in PDF user space. */
export interface Glyph {
  rune: string
  x: number
  y: number
}

/** A single path command in absolute (post-CTM) coordinates. */
export type PathCommand =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }
  | { op: "Z" }

/** Captured clip path: full geometry + bbox for fast tests. */
export interface ClipPath {
  commands: PathCommand[]
  bbox: BBox
  /** True if mupdf passed the even-odd flag (only meaningful for fillPath
   *  clips; clipStrokePath, clipText, clipImageMask are non-zero by definition). */
  evenOdd: boolean
}

interface BaseStreamOp {
  /** Monotonically-increasing sequence number assigned in stream order. */
  seqno: number
  /** Innermost active clip bbox at the time the op fired, or null. Useful for
   *  recovering the visible region of an image that mupdf reports with full
   *  CTM bounds but is actually clipped to a smaller area. */
  activeClipBbox: BBox | null
}

export interface ImageStreamOp extends BaseStreamOp {
  kind: "image" | "imageMask"
  bbox: BBox
  nativeWidth: number
  nativeHeight: number
  /** The Current Transformation Matrix at the time this image was drawn.
   *  Used to detect and apply flip transforms when extracting raster images. */
  currentTransformationMatrix: number[]
  /** True when the underlying mupdf Image has an SMask attached. */
  hasMask: boolean
  /** Full active clip-path stack at the time this image was drawn, outermost
   *  first. PDF clip semantics intersect all active clips; consumers may pick
   *  the innermost / most-restrictive or apply the full stack. Empty when no
   *  clip is active. */
  activeClipPaths: ClipPath[]
  /** Innermost active non-Normal blend mode at draw time, or "Normal" when
   *  no blending applies. Watercolor storybooks frequently use "Multiply"
   *  to make white image backgrounds behave as transparent over the page —
   *  CSS `mix-blend-mode` reproduces this in HTML. */
  blendMode: BlendMode
  /** Composed alpha at draw time: product of every enclosing transparency
   *  group's alpha and the per-op `alpha` argument. 1.0 when fully opaque. */
  alpha: number
  /** Pixel-content digest of the image drawn by this op, present only when the
   *  recorder was run with `hashImages: true`. Lets `stampRasterPlacementsFromOps`
   *  pick the EXACT extracted XObject when several share identical native
   *  dimensions (e.g. a PDF whose pages share one resource dictionary listing
   *  multiple same-size full-page images — dimension-only matching can't tell
   *  them apart). Undefined when hashing was disabled (the common,
   *  unambiguous case). See `hashImagePixels`. */
  contentDigest?: string
}

export interface PathStreamOp extends BaseStreamOp {
  kind: "fillPath" | "strokePath"
  /** Rendered bounds: stroke-inflated for `strokePath`, geometry for
   *  `fillPath`. Used for spatial queries / placement. */
  bbox: BBox
  /** Geometry-only bounds (path outline, no stroke inflation). Identical
   *  to `bbox` for `fillPath`. Used to associate an op with the SVG shape
   *  that produced it by exact geometry identity — a stroked op's `bbox`
   *  is larger than its shape's geometry, so `bbox` can't be matched. */
  geomBbox: BBox
  /** Paint colour as CSS hex (`#rrggbb`), from the op's colorspace+color. */
  color: string
  /** Composed alpha (per-op × transparency-group stack), 0..1. */
  alpha: number
  /** `strokePath` only: line width in transformed (page) space, i.e.
   *  `StrokeState.getLineWidth()` scaled by the CTM. */
  strokeWidth?: number
}

export interface TextStreamOp extends BaseStreamOp {
  kind: "fillText" | "strokeText"
  bbox: BBox
  glyphs: Glyph[]
}

export type StreamOp =
  | ImageStreamOp
  | PathStreamOp
  | TextStreamOp

type AnyPage = ReturnType<MupdfDocument["loadPage"]>

/**
 * Compute a content digest of an image's decoded pixels. Used to disambiguate
 * which extracted XObject a draw op refers to when several share identical
 * native dimensions (dimension-only matching in `stampRasterPlacementsFromOps`
 * can't tell them apart). Hashes the raw native pixmap samples so the SAME
 * digest is produced wherever the same XObject is decoded — both here (stream
 * recording) and at raster extraction (`extractRasterImagesFromPdf`), which
 * both call `toPixmap()` on the same underlying image object.
 */
export function hashImagePixels(image: MupdfImage): string {
  const px = image.toPixmap()
  try {
    return createHash("sha256").update(px.getPixels()).digest("hex").slice(0, 16)
  } finally {
    px.destroy()
  }
}

/**
 * Run `page` through a recording device; return draw ops in stream order.
 *
 * Clip-only ops (`clipPath`, `clipImageMask`, `popClip`, etc.) are tracked
 * internally for the `activeClipBbox` field but not emitted, since they
 * don't draw pixels themselves.
 *
 * `opts.hashImages` makes each image op carry a `contentDigest` (see
 * `hashImagePixels`). It's off by default because decoding every image to a
 * pixmap just to hash it is wasted work for the overwhelmingly common case
 * where a page's images all have distinct dimensions; callers enable it only
 * when they've detected a same-dimension collision among extracted images.
 */
export function recordPageStream(
  page: AnyPage,
  opts: { hashImages?: boolean } = {},
): StreamOp[] {
  const { hashImages = false } = opts
  const ops: StreamOp[] = []
  const clipStack: ClipPath[] = []
  const groupStack: { blendMode: BlendMode; alpha: number }[] = []
  let seqno = 0

  // Content digest for an image op, computed only when requested. Guarded:
  // a decode failure on an unusual image (imagemask, exotic colorspace) must
  // degrade to "no digest" — the matcher then falls back to dimension order —
  // rather than throwing out of `page.run` and aborting the whole page.
  const imageDigest = (image: MupdfImage): { contentDigest?: string } => {
    if (!hashImages) return {}
    try {
      return { contentDigest: hashImagePixels(image) }
    } catch {
      return {}
    }
  }

  const activeClipBbox = (): BBox | null =>
    clipStack.length > 0 ? clipStack[clipStack.length - 1].bbox : null
  const activeClipPaths = (): ClipPath[] => clipStack.slice()
  // Innermost non-Normal blend mode wins. PDF nests transparency groups but
  // a single non-Normal blend mode in the stack determines the visual
  // compositing — the inner one is the most relevant for the draw op.
  const activeBlendMode = (): BlendMode => {
    for (let i = groupStack.length - 1; i >= 0; i--) {
      if (groupStack[i].blendMode !== "Normal") return groupStack[i].blendMode
    }
    return "Normal"
  }
  // Compose group alpha multiplicatively up the stack.
  const composedAlpha = (perOpAlpha: number): number => {
    let a = perOpAlpha
    for (const g of groupStack) a *= g.alpha
    return a
  }

  const device = new mupdf.Device({
    fillPath(path, _evenOdd, ctm, _cs: ColorSpace, color: Color, alpha: number) {
      const geom = rectToBBox(path.getBounds(NO_STROKE, ctm))
      ops.push({
        seqno: seqno++,
        kind: "fillPath",
        bbox: geom,
        geomBbox: geom,
        color: colorToCss(color),
        alpha: composedAlpha(alpha ?? 1),
        activeClipBbox: activeClipBbox(),
      })
    },
    strokePath(path, stroke, ctm, _cs: ColorSpace, color: Color, alpha: number) {
      ops.push({
        seqno: seqno++,
        kind: "strokePath",
        bbox: rectToBBox(path.getBounds(stroke, ctm)),
        // Geometry bounds without stroke inflation — matches the SVG
        // shape's bbox so the op can be tied back to its figure.
        geomBbox: rectToBBox(path.getBounds(NO_STROKE, ctm)),
        color: colorToCss(color),
        alpha: composedAlpha(alpha ?? 1),
        strokeWidth: stroke.getLineWidth() * ctmScale(ctm),
        activeClipBbox: activeClipBbox(),
      })
    },
    clipPath(path, evenOdd, ctm) {
      clipStack.push({
        commands: collectPathCommands(path, ctm),
        bbox: rectToBBox(path.getBounds(NO_STROKE, ctm)),
        evenOdd: !!evenOdd,
      })
    },
    clipStrokePath(path, stroke, ctm) {
      clipStack.push({
        commands: collectPathCommands(path, ctm),
        bbox: rectToBBox(path.getBounds(stroke, ctm)),
        evenOdd: false,
      })
    },
    fillText(text, ctm /*, _cs, _color, _alpha */) {
      ops.push({
        seqno: seqno++,
        kind: "fillText",
        bbox: rectToBBox(text.getBounds(NO_STROKE, ctm)),
        glyphs: collectGlyphs(text, ctm),
        activeClipBbox: activeClipBbox(),
      })
    },
    strokeText(text, stroke, ctm /*, _cs, _color, _alpha */) {
      ops.push({
        seqno: seqno++,
        kind: "strokeText",
        bbox: rectToBBox(text.getBounds(stroke, ctm)),
        glyphs: collectGlyphs(text, ctm),
        activeClipBbox: activeClipBbox(),
      })
    },
    clipText(text, ctm) {
      // Text-shaped clips can't be expressed as a single path; we keep the
      // bbox approximation so containment queries still work, but emit no
      // commands. Visual fidelity for these is rare in storybook PDFs.
      clipStack.push({
        commands: [],
        bbox: rectToBBox(text.getBounds(NO_STROKE, ctm)),
        evenOdd: false,
      })
    },
    clipStrokeText(text, stroke, ctm) {
      clipStack.push({
        commands: [],
        bbox: rectToBBox(text.getBounds(stroke, ctm)),
        evenOdd: false,
      })
    },
    ignoreText() {
      // No pixels drawn; ignore.
    },
    fillImage(image, ctm, alpha) {
      ops.push({
        seqno: seqno++,
        kind: "image",
        bbox: unitImageBbox(ctm),
        nativeWidth: image.getWidth(),
        nativeHeight: image.getHeight(),
        currentTransformationMatrix: ctm,
        hasMask: !!image.getMask(),
        activeClipBbox: activeClipBbox(),
        activeClipPaths: activeClipPaths(),
        blendMode: activeBlendMode(),
        alpha: composedAlpha(alpha ?? 1),
        ...imageDigest(image),
      })
    },
    fillImageMask(image, ctm, _cs, _color, alpha) {
      ops.push({
        seqno: seqno++,
        kind: "imageMask",
        bbox: unitImageBbox(ctm),
        nativeWidth: image.getWidth(),
        nativeHeight: image.getHeight(),
        currentTransformationMatrix: ctm,
        hasMask: false,
        activeClipBbox: activeClipBbox(),
        activeClipPaths: activeClipPaths(),
        blendMode: activeBlendMode(),
        alpha: composedAlpha(alpha ?? 1),
        ...imageDigest(image),
      })
    },
    clipImageMask(_image, ctm) {
      // Image-mask clips: synthesize a unit-square path through the CTM so
      // downstream code can apply a rectangular clip-path. The mask's pixel
      // alpha shape is not available here, but the AABB is the correct
      // outer bound and matches what most PDFs use these for (rectangular
      // image crops dressed as masks).
      const bbox = unitImageBbox(ctm)
      clipStack.push({
        commands: bboxToPathCommands(bbox),
        bbox,
        evenOdd: false,
      })
    },
    popClip() {
      clipStack.pop()
    },
    // Group / mask / tile / layer brackets are tracked-as-no-ops for now —
    // they don't draw pixels themselves. Inner draw ops emit normally and
    // the outer transparency/blend semantics are baked into the page render
    // we already produce. Re-introduce when needed.
    beginMask() {},
    endMask() {},
    beginGroup(_bbox, _cs, _isolated, _knockout, blendmode, alpha) {
      groupStack.push({ blendMode: blendmode, alpha: alpha ?? 1 })
    },
    endGroup() {
      groupStack.pop()
    },
    beginTile() {
      return 0
    },
    endTile() {},
    beginLayer() {},
    endLayer() {},
    close() {},
  })

  try {
    page.run(device, mupdf.Matrix.identity as MupdfMatrix)
  } finally {
    // mupdf C requires `fz_close_device` before `fz_drop_device`; without
    // the explicit close, mupdf logs "dropping unclosed device" when the
    // FinalizationRegistry eventually drops the WASM pointer. We do both
    // eagerly so resources release in deterministic order.
    device.close()
    device.destroy()
  }
  return ops
}

/** Convert mupdf Rect tuple to {x0,y0,x1,y1}. */
function rectToBBox(r: [number, number, number, number]): BBox {
  return { x0: r[0], y0: r[1], x1: r[2], y1: r[3] }
}

/** Scalar scale of a 2×3 affine CTM `[a,b,c,d,e,f]` — the larger of the
 *  two axis norms, so a non-uniform transform never under-scales a stroke
 *  width. Mirrors `parseStrokeInkExtent` in extract.ts. */
function ctmScale(ctm: number[]): number {
  const [a, b, c, d] = ctm
  return Math.max(Math.hypot(a, b), Math.hypot(c, d)) || 1
}

/** Compute the AABB of an image after applying its CTM. The image's natural
 *  domain is [0,1]×[0,1]; the CTM maps that to page coordinates (post-CTM
 *  the rect can be rotated/skewed, hence we take the AABB of the corners). */
function unitImageBbox(ctm: number[]): BBox {
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => transformPoint(ctm, x, y))
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  }
}

function transformPoint(
  ctm: number[],
  x: number,
  y: number,
): [number, number] {
  return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]
}

/** Walk a Path and collect its draw commands, applying the device CTM so the
 *  resulting coordinates are in the same absolute (mupdf-internal y-down)
 *  space that other ops report. */
function collectPathCommands(
  path: { walk: (w: object) => void },
  ctm: number[],
): PathCommand[] {
  const cmds: PathCommand[] = []
  const tx = (x: number, y: number): [number, number] => [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ]
  path.walk({
    moveTo(x: number, y: number) {
      const [ax, ay] = tx(x, y)
      cmds.push({ op: "M", x: ax, y: ay })
    },
    lineTo(x: number, y: number) {
      const [ax, ay] = tx(x, y)
      cmds.push({ op: "L", x: ax, y: ay })
    },
    curveTo(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x3: number,
      y3: number,
    ) {
      const [ax1, ay1] = tx(x1, y1)
      const [ax2, ay2] = tx(x2, y2)
      const [ax3, ay3] = tx(x3, y3)
      cmds.push({
        op: "C",
        x1: ax1,
        y1: ay1,
        x2: ax2,
        y2: ay2,
        x3: ax3,
        y3: ay3,
      })
    },
    closePath() {
      cmds.push({ op: "Z" })
    },
  })
  return cmds
}

/** Synthesize a closed rectangular path from a bbox (used for image-mask
 *  clips, where the alpha shape isn't available but the AABB is the right
 *  outer bound). */
function bboxToPathCommands(b: BBox): PathCommand[] {
  return [
    { op: "M", x: b.x0, y: b.y0 },
    { op: "L", x: b.x1, y: b.y0 },
    { op: "L", x: b.x1, y: b.y1 },
    { op: "L", x: b.x0, y: b.y1 },
    { op: "Z" },
  ]
}

/** Walk a Text object and collect each glyph's unicode + baseline origin.
 *  The glyph trm passed to `showGlyph` is in PDF text-space (y-up); we
 *  compose it with the device's outer ctm to get the absolute baseline
 *  position in mupdf-internal y-down coords (top-left origin) — matching
 *  the coord system of every other op the device emits. */
function collectGlyphs(
  text: { walk: (w: object) => void },
  ctm: number[],
): Glyph[] {
  const glyphs: Glyph[] = []
  text.walk({
    showGlyph(
      _font: unknown,
      trm: number[],
      _gid: number,
      ucs: number,
    ) {
      // ucs <= 0 marks unmapped glyphs (e.g. ligatures missing /ToUnicode).
      // Skip: they don't help paragraph matching and would push noise into
      // diagnostics. The paragraph's text content comes from asHTML anyway.
      if (ucs <= 0) return
      const tx = trm[4]
      const ty = trm[5]
      const x = ctm[0] * tx + ctm[2] * ty + ctm[4]
      const y = ctm[1] * tx + ctm[3] * ty + ctm[5]
      glyphs.push({ rune: String.fromCharCode(ucs), x, y })
    },
  })
  return glyphs
}
