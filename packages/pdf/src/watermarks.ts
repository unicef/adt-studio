/**
 * Watermark detection and removal.
 *
 * Publisher watermarks ("FOR ONLINE READING ONLY" stamped diagonally across
 * every page) pollute three extraction surfaces: the page render (and thus
 * every figure crop taken from it), the reflowable text layer, and the
 * positioned-text output used by fixed-layout rendering.
 *
 * Detection is op-level and cross-page: the same text drawn with the same
 * geometry on most sampled pages is a watermark candidate; a size/rotation
 * gate (diagonal rotation, or a bbox spanning a large share of the page)
 * keeps running heads and other repeated page furniture out of the match.
 * Removal then happens per surface:
 *
 * - `renderPageWithoutWatermarks` re-renders the page through a forwarding
 *   device that drops matching text ops before they reach the rasterizer.
 * - `isWatermarkLine` lets text-layer consumers drop lines fully composed of
 *   watermark strings (handles word-by-word draw ops).
 * - Detected signatures are echoed into the extraction debug output so the
 *   removal is inspectable, never silent.
 */
import mupdf, {
  type Color,
  type Document as MupdfDocument,
  type Matrix as MupdfMatrix,
  type Shade as MupdfShade,
  type StrokeState,
  type Text as MupdfText,
} from "mupdf";

// DeviceFunctions callbacks type `color` as number[]; Device methods take the
// Color tuple. The runtime values are identical — narrow at the boundary.
const asColor = (color: number[]): Color => color as Color;

/**
 * Work around an upstream mupdf.js bug in the JS-device callback dispatch:
 * `fill_shade` wraps the BORROWED fz_shade pointer in `new Shade(shade)`
 * without keeping a reference, unlike every other callback (which keeps
 * explicitly, or — like Image — keeps inside the constructor). Userdata
 * registers each wrapper in a FinalizationRegistry whose finalizer drops the
 * pointer, so when V8 collects the wrapper mid-extraction it frees a shade
 * the document's store still uses. Later draws of that cached shade then
 * read freed memory — surfacing as "Unexpected mesh type <pointer>" and
 * "missing color converter" errors on unrelated pages.
 *
 * Unregistering the wrapper (and zeroing its pointer) makes the never-owned
 * reference never dropped, which is the correct balance. Only Shade needs
 * this; all other wrapper types received by device callbacks are kept.
 */
function neutralizeBorrowedShadeWrapper(shade: MupdfShade): void {
  const ctor = shade.constructor as unknown as {
    _finalizer?: { unregister: (token: object) => void };
  };
  ctor._finalizer?.unregister(shade);
  (shade as unknown as { pointer: number }).pointer = 0;
}

// mupdf's getBounds typings require a StrokeState but the runtime accepts
// null for unstroked-bound queries (same cast as page-stream-recorder).
const NO_STROKE = null as unknown as StrokeState;

/** Maximum number of pages sampled for cross-page repetition detection. */
const DETECT_SAMPLE_PAGES = 16;

/** A candidate must appear on at least this share of sampled pages. */
const DETECT_MIN_COVERAGE = 0.6;

/** Non-rotated candidates must span at least this share of the page diagonal. */
const DETECT_MIN_DIAGONAL_RATIO = 0.35;

/** Per-edge tolerance (page points) when matching an op against a signature. */
const MATCH_BBOX_TOLERANCE = 3;

/** Repeated strings shorter than this are ignored (decorative glyphs). */
const DETECT_MIN_TEXT_LENGTH = 3;

export interface WatermarkSignature {
  /** Whitespace-stripped text content of the repeated draw op. */
  text: string;
  /** Op bbox in page points, normalized to a top-left page origin of 0,0. */
  bbox: [number, number, number, number];
  /** True when the glyph baseline is diagonal (not axis-aligned). */
  rotated: boolean;
  /** Pages (of those sampled) on which the op appeared identically. */
  pagesSeen: number;
  /** Pages sampled during detection. */
  pagesSampled: number;
}

export type WatermarkBBox = [number, number, number, number];

interface TextOpInfo {
  text: string;
  bbox: [number, number, number, number];
  rotated: boolean;
}

/** Decode a text op: whitespace-stripped string, bbox, and rotation flag. */
function decodeTextOp(text: MupdfText, ctm: MupdfMatrix): TextOpInfo | null {
  let str = "";
  let rotated = false;
  text.walk({
    showGlyph(_font, trm, _gid, ucs) {
      if (ucs > 0) {
        const rune = String.fromCharCode(ucs);
        if (rune.trim().length > 0) str += rune;
      }
      if (!rotated) {
        // Compose glyph transform with the CTM; a diagonal baseline has all
        // four linear coefficients non-zero (0°/90°/180°/270° each zero two).
        const a = trm[0] * ctm[0] + trm[1] * ctm[2];
        const b = trm[0] * ctm[1] + trm[1] * ctm[3];
        const c = trm[2] * ctm[0] + trm[3] * ctm[2];
        const d = trm[2] * ctm[1] + trm[3] * ctm[3];
        const eps = 1e-3;
        rotated =
          Math.abs(a) > eps && Math.abs(b) > eps &&
          Math.abs(c) > eps && Math.abs(d) > eps;
      }
    },
  });
  if (str.length === 0) return null;
  const [x0, y0, x1, y1] = text.getBounds(NO_STROKE, ctm);
  if (!(x1 > x0) || !(y1 > y0)) return null;
  return { text: str, bbox: [x0, y0, x1, y1], rotated };
}

/** Collect decoded fill/stroke text ops for one page, origin-normalized. */
function collectPageTextOps(page: ReturnType<MupdfDocument["loadPage"]>): {
  ops: TextOpInfo[];
  pageDiagonal: number;
} {
  const bounds = page.getBounds();
  const originX = bounds[0];
  const originY = bounds[1];
  const pageDiagonal = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const ops: TextOpInfo[] = [];
  const record = (text: MupdfText, ctm: MupdfMatrix): void => {
    const info = decodeTextOp(text, ctm);
    if (!info) return;
    ops.push({
      ...info,
      bbox: [
        info.bbox[0] - originX,
        info.bbox[1] - originY,
        info.bbox[2] - originX,
        info.bbox[3] - originY,
      ],
    });
  };
  const device = new mupdf.Device({
    fillText(text, ctm) {
      record(text, ctm);
    },
    strokeText(text, _stroke, ctm) {
      record(text, ctm);
    },
  });
  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return { ops, pageDiagonal };
}

/** Stable aggregation key: identical text at (near-)identical geometry. */
function opKey(op: TextOpInfo): string {
  const r = (v: number): number => Math.round(v / 2) * 2;
  return `${op.text}@${r(op.bbox[0])},${r(op.bbox[1])},${r(op.bbox[2])},${r(op.bbox[3])}`;
}

/**
 * Detect repeated identical text stamps across the document.
 *
 * Samples up to `DETECT_SAMPLE_PAGES` pages evenly over the whole document
 * (independent of any extraction page range, so partial extractions of the
 * same PDF always agree on the signatures).
 */
export function detectTextWatermarks(doc: MupdfDocument): WatermarkSignature[] {
  const totalPages = doc.countPages();
  if (totalPages < 2) return [];

  const sampleCount = Math.min(totalPages, DETECT_SAMPLE_PAGES);
  const pageIndices = new Set<number>();
  for (let i = 0; i < sampleCount; i++) {
    pageIndices.add(Math.floor((i * totalPages) / sampleCount));
  }

  const byKey = new Map<string, { op: TextOpInfo; pages: Set<number>; diagRatio: number }>();
  let pagesSampled = 0;
  for (const pageIndex of pageIndices) {
    let collected: { ops: TextOpInfo[]; pageDiagonal: number };
    try {
      collected = collectPageTextOps(doc.loadPage(pageIndex));
    } catch {
      continue; // one broken page must not disable detection
    }
    pagesSampled++;
    // A page may draw the same op twice (shadowed stamps); the Set keeps the
    // per-page contribution to 1 so repetition means "appears on N pages".
    for (const op of collected.ops) {
      const key = opKey(op);
      const existing = byKey.get(key);
      const diag = Math.hypot(op.bbox[2] - op.bbox[0], op.bbox[3] - op.bbox[1]);
      const diagRatio = collected.pageDiagonal > 0 ? diag / collected.pageDiagonal : 0;
      if (existing) {
        existing.pages.add(pageIndex);
        existing.diagRatio = Math.max(existing.diagRatio, diagRatio);
      } else {
        byKey.set(key, { op, pages: new Set([pageIndex]), diagRatio });
      }
    }
  }
  if (pagesSampled < 2) return [];

  const minPages = Math.max(2, Math.ceil(DETECT_MIN_COVERAGE * pagesSampled));
  const signatures: WatermarkSignature[] = [];
  for (const { op, pages, diagRatio } of byKey.values()) {
    if (pages.size < minPages) continue;
    if (op.text.length < DETECT_MIN_TEXT_LENGTH) continue;
    // Repetition alone also matches running heads; require the stamp shape.
    if (!op.rotated && diagRatio < DETECT_MIN_DIAGONAL_RATIO) continue;
    signatures.push({
      text: op.text,
      bbox: op.bbox,
      rotated: op.rotated,
      pagesSeen: pages.size,
      pagesSampled,
    });
  }
  return signatures;
}

function bboxMatches(
  a: [number, number, number, number],
  b: [number, number, number, number],
  tolerance: number,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  );
}

function bboxSubstantiallyOverlaps(a: WatermarkBBox, b: WatermarkBBox): boolean {
  const intersectionWidth = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const intersectionHeight = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const intersectionArea = intersectionWidth * intersectionHeight;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const smallerArea = Math.min(areaA, areaB);
  return smallerArea > 0 && intersectionArea / smallerArea >= 0.7;
}

/**
 * True when a text line is fully composed of watermark strings: removing
 * every signature occurrence leaves nothing. Handles watermarks drawn as a
 * single op ("FOR ONLINE READING ONLY") and word-by-word ops ("FOR",
 * "ONLINE", …) without ever dropping a line that carries real content.
 */
export function isWatermarkLine(
  line: string,
  bbox: WatermarkBBox | undefined,
  watermarks: WatermarkSignature[],
): boolean {
  if (!bbox) return false;

  const candidates = watermarks.filter((sig) => {
    const [x0, y0, x1, y1] = sig.bbox;
    return x1 >= bbox[0] - MATCH_BBOX_TOLERANCE
      && x0 <= bbox[2] + MATCH_BBOX_TOLERANCE
      && y1 >= bbox[1] - MATCH_BBOX_TOLERANCE
      && y0 <= bbox[3] + MATCH_BBOX_TOLERANCE;
  });
  if (candidates.length === 0) return false;

  let rest = line.replace(/\s+/g, "");
  if (rest.length === 0) return false;
  for (const sig of candidates) {
    if (sig.text.length === 0) continue;
    while (rest.includes(sig.text)) {
      rest = rest.replace(sig.text, "");
    }
  }
  if (rest.length > 0) return false;

  // Equality alone is unsafe: a short stamp op such as "ONLY" can occur in
  // legitimate text elsewhere. The union handles word-by-word watermark ops.
  const union: WatermarkBBox = [
    Math.min(...candidates.map((sig) => sig.bbox[0])),
    Math.min(...candidates.map((sig) => sig.bbox[1])),
    Math.max(...candidates.map((sig) => sig.bbox[2])),
    Math.max(...candidates.map((sig) => sig.bbox[3])),
  ];
  return bboxMatches(union, bbox, MATCH_BBOX_TOLERANCE * 2)
    || bboxSubstantiallyOverlaps(union, bbox);
}

/**
 * Render the page to a PNG at `scale`, dropping text ops that match a
 * detected watermark signature (same string, same page geometry). All other
 * ops are forwarded verbatim to a DrawDevice, so output is pixel-identical
 * to `page.toPixmap` except for the removed stamps. Returns null on any
 * failure so callers can fall back to the standard render.
 */
export function renderPageWithoutWatermarks(
  page: ReturnType<MupdfDocument["loadPage"]>,
  scale: number,
  watermarks: WatermarkSignature[],
): Buffer | null {
  if (watermarks.length === 0) return null;

  const bounds = page.getBounds();
  const originX = bounds[0];
  const originY = bounds[1];
  const width = Math.round((bounds[2] - bounds[0]) * scale);
  const height = Math.round((bounds[3] - bounds[1]) * scale);
  if (width <= 0 || height <= 0) return null;

  // Map ops into pixmap space: shift the page origin to 0,0 then scale.
  const matrix: MupdfMatrix = [
    scale,
    0,
    0,
    scale,
    -originX * scale,
    -originY * scale,
  ];

  const isWatermarkTextOp = (text: MupdfText, ctm: MupdfMatrix): boolean => {
    const info = decodeTextOp(text, ctm);
    if (!info) return false;
    // The callback CTM is composed with `matrix`, so measured bounds are in
    // pixmap space; divide by scale to get origin-normalized page points.
    const pageBbox: [number, number, number, number] = [
      info.bbox[0] / scale,
      info.bbox[1] / scale,
      info.bbox[2] / scale,
      info.bbox[3] / scale,
    ];
    return watermarks.some(
      (sig) =>
        sig.text === info.text &&
        bboxMatches(sig.bbox, pageBbox, MATCH_BBOX_TOLERANCE),
    );
  };

  let pixmap: InstanceType<typeof mupdf.Pixmap> | undefined;
  let draw: InstanceType<typeof mupdf.DrawDevice> | undefined;
  let forward: InstanceType<typeof mupdf.Device> | undefined;
  try {
    pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
    pixmap.clear(255);
    draw = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
    const dev = draw;

    // Every DeviceFunctions callback must be forwarded — an omitted callback
    // silently drops that op class from the render.
    forward = new mupdf.Device({
      fillPath(path, evenOdd, ctm, colorspace, color, alpha) {
        dev.fillPath(path, evenOdd, ctm, colorspace, asColor(color), alpha);
      },
      strokePath(path, stroke, ctm, colorspace, color, alpha) {
        dev.strokePath(path, stroke, ctm, colorspace, asColor(color), alpha);
      },
      clipPath(path, evenOdd, ctm) {
        dev.clipPath(path, evenOdd, ctm);
      },
      clipStrokePath(path, stroke, ctm) {
        dev.clipStrokePath(path, stroke, ctm);
      },
      fillText(text, ctm, colorspace, color, alpha) {
        if (isWatermarkTextOp(text, ctm)) return;
        dev.fillText(text, ctm, colorspace, asColor(color), alpha);
      },
      strokeText(text, stroke, ctm, colorspace, color, alpha) {
        if (isWatermarkTextOp(text, ctm)) return;
        dev.strokeText(text, stroke, ctm, colorspace, asColor(color), alpha);
      },
      clipText(text, ctm) {
        dev.clipText(text, ctm);
      },
      clipStrokeText(text, stroke, ctm) {
        dev.clipStrokeText(text, stroke, ctm);
      },
      ignoreText(text, ctm) {
        dev.ignoreText(text, ctm);
      },
      fillShade(shade, ctm, alpha) {
        try {
          dev.fillShade(shade, ctm, alpha);
        } finally {
          neutralizeBorrowedShadeWrapper(shade);
        }
      },
      fillImage(image, ctm, alpha) {
        dev.fillImage(image, ctm, alpha);
      },
      fillImageMask(image, ctm, colorspace, color, alpha) {
        dev.fillImageMask(image, ctm, colorspace, asColor(color), alpha);
      },
      clipImageMask(image, ctm) {
        dev.clipImageMask(image, ctm);
      },
      popClip() {
        dev.popClip();
      },
      beginMask(area, luminosity, colorspace, color) {
        dev.beginMask(area, luminosity, colorspace, asColor(color));
      },
      endMask() {
        dev.endMask();
      },
      beginGroup(area, colorspace, isolated, knockout, blendmode, alpha) {
        dev.beginGroup(area, colorspace, isolated, knockout, blendmode, alpha);
      },
      endGroup() {
        dev.endGroup();
      },
      beginTile(area, view, xstep, ystep, ctm, id, docId) {
        return dev.beginTile(area, view, xstep, ystep, ctm, id, docId);
      },
      endTile() {
        dev.endTile();
      },
      beginLayer(name) {
        dev.beginLayer(name);
      },
      endLayer() {
        dev.endLayer();
      },
    });

    page.run(forward, matrix);
    forward.close();
    forward = undefined;
    draw.close();
    draw = undefined;
    return Buffer.from(pixmap.asPNG());
  } catch (err) {
    console.warn(
      "[pdf] watermark-filtered render failed, falling back to standard render:",
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    try {
      forward?.close();
    } catch { /* already closed or never opened */ }
    try {
      draw?.close();
    } catch { /* already closed or never opened */ }
    pixmap?.destroy();
  }
}
