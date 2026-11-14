/**
 * Raster watermark detection and removal.
 *
 * `watermarks.ts` removes stamps that exist as text ops. A PDF that was
 * flattened ("printed to PDF", scanned, exported as pictures) has no such
 * op: the stamp is part of each page image's pixels, so there is nothing to
 * drop. This module handles that encoding.
 *
 * Detection is cross-page, like the text detector. Page content differs
 * from page to page while a stamp is identical, so at every pixel the median
 * darkness over the pages where that pixel would otherwise be blank paper is
 * the stamp. Only image ops are rendered for learning, so vector and text
 * content (which this module cannot edit) never becomes part of the model.
 *
 * Removal happens on each embedded image's own pixel grid, never on a
 * resampled page render: resampling smears the stamp's edges and leaves an
 * outline behind. The cleaned image is then used for both surfaces —
 * swapped into the page render, and emitted as the extracted raster — so the
 * page image and the figures cropped from it agree.
 *
 * The stamp darkens a pixel's brightness by a share of its value (`seen =
 * original * (1 - opacity)`), so dividing restores what was underneath,
 * including text and pictures the stamp crosses. What it did to colour is
 * measured per image rather than assumed: a true multiply fades colour with
 * brightness, but flattened pages usually keep the colour, and assuming the
 * wrong one leaves a tinted ghost on coloured backgrounds.
 *
 * A stamp is not always on top of the page, though, so removal first works
 * out what it did at each pixel (see `fitStamp`). Where page content was
 * drawn over the stamp, it is hidden and must be left alone: dividing there
 * would leave a bright ghost of its letters. Where the stamp is an opaque
 * grey that replaced coloured content, there is nothing to divide, and the
 * stroke is filled in from the colour around it instead.
 *
 * Scope: one large neutral (grey/black) mark, up to about 60% grey, at a
 * fixed page position, on documents with enough image pages showing blank
 * paper under it.
 */
import mupdf, {
  type Document as MupdfDocument,
  type Image as MupdfImage,
  type Matrix as MupdfMatrix,
} from "mupdf";
import { imageHasMask } from "./mupdf-image-refs.js";
import { unitImageBbox } from "./page-stream-recorder.js";
import { renderPageFiltered, spreadPageIndices, type WatermarkSignature } from "./watermarks.js";

type AnyPage = ReturnType<MupdfDocument["loadPage"]>;

/** Pages checked for image coverage (evenly spread over the document). */
const MAX_CANDIDATE_PAGES = 96;

/** If none of this many evenly spread pages is an image page, stop early. */
const PRECHECK_PAGES = 16;

/** A page is an "image page" when image ops cover this share of its area. */
const IMAGE_PAGE_MIN_COVERAGE = 0.6;

/** An image coarser than this, in either direction, is not a page picture. */
const MIN_PICTURE_DPI = 48;

/** Learning needs at least this many image pages. */
const MIN_IMAGE_PAGES = 8;

/** Memory budget for the per-page darkness planes kept while learning. */
const LEARN_BUDGET_BYTES = 64 * 1024 * 1024;

/** Image pixels decoded per learning pass before fewer pages are read. */
const LEARN_DECODE_BUDGET = 300_000_000;

/** Largest whole-page grid used to locate the stamp. */
const LOCATE_PIXELS = 1_000_000;

/** Finest grid the stamp is learned on; sharper scans are learned at this. */
const MAX_NATIVE_DPI = 300;

/** Largest stamp box, in pixels, that is learned or removed. Removal keeps
 *  dozens of buffers this size alive at once. */
const MAX_STAMP_PIXELS = 3_000_000;

/** Window sizes below are stated in pixels at this resolution. */
const REFERENCE_DPI = 100;

/** Blank paper: mostly at least this bright, with no ink and no colour. */
const PAPER_WHITE_LEVEL = 246;
const INK_LEVEL = 100;
const MAX_PAPER_SATURATION = 16;

/** Learned darkness below this is scanner/JPEG noise, not a mark. */
const NOISE_FLOOR = 2.5;

/** A group of samples this much darker than a pixel's paper may be the stamp. */
const STAMP_GROUP_GAP = 8;

/** Such a group must be at least this share of the pixel's samples. */
const MIN_STAMP_GROUP_SHARE = 0.2;

/** Darkness that counts as part of a mark when outlining it. */
const MARK_LEVEL = 6;

/** Opacity is capped: a darker "mark" is content, and dividing by it explodes. */
const MAX_OPACITY = 0.6;

/** The mark must reach this opacity somewhere to be worth removing. Kept
 *  above `MIN_EVIDENCE_OPACITY`, below which a stamp pixel cannot be told
 *  from noise and so could be detected but never removed. */
const MIN_PEAK_OPACITY = 0.08;

/** The mark must span this share of the page diagonal (page furniture is smaller). */
const MIN_DIAGONAL_RATIO = 0.25;

/** The mark's shorter side must be at least this long (reference pixels). */
const MIN_MARK_SIDE = 24;

/** A straight run this long, as a share of the page's shorter side, is a rule. */
const STRAIGHT_RUN_SHARE_OF_PAGE = 0.08;

/** A mark made mostly of such runs is a rule, frame or grid, not a stamp. */
const MAX_STRAIGHT_RUN_SHARE = 0.5;

/** A mark whose blank-paper samples had colour close by more often than
 *  this is the fringe of a coloured stamp, not a grey one. */
const MAX_SHARE_BESIDE_COLOUR = 0.5;

/** Only the heaviest few marks are weighed up as the stamp. */
const MAX_MARKS_CONSIDERED = 8;

/** Box-filter outputs at or below this are zero (guards float residue). */
const NONE = 1e-6;

/** The close-by window is used when this share of it is usable reference. */
const NEAR_REFERENCE_SHARE = 0.2;

/** Share of a neighbourhood that must be unstamped paper or colour before
 *  it can say which of the two a stamp pixel sits on. */
const REPLACED_MIN_SURFACE_SHARE = 0.1;

/** Layers peeled when filling in a replaced stroke from its edges. */
const MAX_FILL_LAYERS = 24;

/** Surroundings must be at least this coloured to say whether a grey stamp
 *  pixel replaced them or merely darkened them. */
const MIN_TELLING_TINT = 24;

/** Document-wide share of replaced stamp from which strokes are filled in. */
const REPLACES_CONTENT_MIN = 0.35;

/** Share of a stroke's pixels that must look replaced for it to be filled in. */
const REPLACED_MIN_VOTE = 0.4;

/** Such a pixel, divided by the stamp, must land on paper white. */
const REPLACED_LEVEL_FROM = 228;
const REPLACED_LEVEL_TO = 285;

/** Coloured content darker than this is too dark to judge a stamp against. */
const DARK_COLOUR_LEVEL = 24;

/** Share of a neighbourhood that must be paper for a pixel to count as on it. */
const MIN_PAPER_SHARE = 0.03;

/** Neutral surroundings at least this bright are paper, not a grey object. */
const PAPER_LIKE_LEVEL = 240;

/** Below this strength, measured over a whole image, the stamp is absent. */
const MIN_PRESENT_STRENGTH = 0.3;

/** Colour difference from grey below which a pixel counts as neutral. */
const NEUTRAL_CHROMA = 10;

/** A stamp pixel needs this opacity to say anything about whether it shows. */
const MIN_EVIDENCE_OPACITY = 0.06;

/** Share of a neighbourhood that must be usable reference pixels. */
const MIN_REFERENCE_SHARE = 0.08;

/** Relative brightness noise of even a flat reference (compression). */
const REFERENCE_NOISE = 0.02;

/** Measured presence below / above these is treated as fully hidden / showing. */
const HIDDEN_BELOW = 0.15;
const SHOWS_ABOVE = 0.85;

/** How much a pixel's own evidence counts against its neighbourhood's. */
const OWN_EVIDENCE_WEIGHT = 1;

/** How much the fallback counts; only matters where evidence is thin. */
const PRIOR_WEIGHT = 2;

/** Trust needed before an image's own "shows over colour" answer is used,
 *  for an image at the reference resolution. */
const OVER_CONTENT_EVIDENCE = 20000;

/** An image must overlap this many stamp pixels before it is touched. */
const MIN_STAMP_PIXELS = 80;

/** Pages pooled to measure what the stamp did to colour. */
const COLOUR_FIT_PAGES = 24;

/** JPEG quality used when a cleaned image replaces a JPEG original. */
const CLEANED_JPEG_QUALITY = 92;

/** Brightness weights (Rec. 601, the ones JPEG uses). */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

export interface RasterWatermark {
  /** Learning grid resolution, in pixels per PDF point. */
  scale: number;
  /** Stamp bounding box on the learning grid (pixels, page top-left origin). */
  box: [number, number, number, number];
  /** Stamp opacity (0..MAX_OPACITY) for every pixel of `box`, row-major. */
  opacity: Float32Array;
  /** Highest opacity in the stamp. */
  peakOpacity: number;
  /**
   * What the stamp did to colour across the document: 1 when it faded colour
   * along with brightness (a true multiply), 0 when it darkened brightness
   * only. Used for images that cross too little tinted area to tell.
   */
  colourFade: number;
  /**
   * Whether the stamp shows over coloured page content (1) or was drawn
   * underneath it (0), across the document. Used where an image is too busy
   * to tell.
   */
  overContent: number;
  /**
   * Share of the stamp over coloured content that is an opaque grey which
   * replaced that content, rather than a darkening of it. High values turn
   * on filling such strokes in from their surroundings.
   */
  replacesContent: number;
  /** Image pages the stamp was learned from. */
  pagesSampled: number;
}

/** JSON-safe summary recorded in the extraction debug output. */
export interface RasterWatermarkDebug {
  /** Stamp bounding box in PDF points (page top-left origin). */
  bbox: [number, number, number, number];
  peakOpacity: number;
  colourFade: number;
  overContent: number;
  replacesContent: number;
  pagesSampled: number;
  /** Fitted stamp strength of each image cleaned on this page (1 = as learned). */
  cleanedImageStrengths: number[];
}

/** A cleaned copy of one image drawn on a page. */
export interface CleanedRaster {
  width: number;
  height: number;
  /** 1 (grey) or 3 (RGB) samples per pixel, no alpha. */
  components: number;
  /** Placement on the page in PDF points (page top-left origin). */
  bbox: [number, number, number, number];
  pixels: Uint8Array;
  strength: number;
}

// ── Small image operators ───────────────────────────────────────────────

/** Mean over a (2r+1)² window; windows are clipped at the edges. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) acc += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      tmp[row + x] = acc / (hi - lo + 1);
      if (x + r + 1 < w) acc += src[row + x + r + 1];
      if (x - r >= 0) acc -= src[row + x - r];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      out[y * w + x] = acc / (hi - lo + 1);
      if (y + r + 1 < h) acc += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) acc -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

/** Three box passes approximate a Gaussian blur. */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  return boxMean(boxMean(boxMean(src, w, h, r), w, h, r), w, h, r);
}

/** Fine detail only: the signal minus its blurred copy. */
function highPass(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const low = blur(src, w, h, r);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] - low[i];
  return out;
}

function medianOf(values: Float32Array): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[sorted.length >> 1];
}

// ── Detection ───────────────────────────────────────────────────────────

interface PageImageCoverage {
  /** Share of the page area covered by pictures (see `MIN_PICTURE_DPI`). */
  coverage: number;
  /** Pixels in all the images the page draws: what rendering it costs. */
  imagePixels: number;
  /** Resolution of the largest image as placed, in pixels per inch. */
  dpi: number;
  widthPt: number;
  heightPt: number;
}

/** How much of the page its images cover, and at what resolution. */
function measureImageCoverage(page: AnyPage): PageImageCoverage {
  const bounds = page.getBounds();
  const widthPt = bounds[2] - bounds[0];
  const heightPt = bounds[3] - bounds[1];
  let covered = 0;
  let largest = 0;
  let dpi = 0;
  let imagePixels = 0;
  const device = new mupdf.Device({
    fillImage(image, ctm) {
      imagePixels += image.getWidth() * image.getHeight();
      // A picture, not a few pixels stretched across the page: designs are
      // often exported with gradients as 256×1 images, and a page built
      // from those is a vector page that only looks image-covered.
      const acrossPt = Math.hypot(ctm[0], ctm[1]);
      const downPt = Math.hypot(ctm[2], ctm[3]);
      if (acrossPt <= 0 || downPt <= 0) return;
      const acrossDpi = (image.getWidth() / acrossPt) * 72;
      const downDpi = (image.getHeight() / downPt) * 72;
      if (Math.min(acrossDpi, downDpi) < MIN_PICTURE_DPI) return;
      const placed = unitImageBbox(ctm);
      const area =
        Math.max(0, Math.min(bounds[2], placed.x1) - Math.max(bounds[0], placed.x0)) *
        Math.max(0, Math.min(bounds[3], placed.y1) - Math.max(bounds[1], placed.y0));
      covered += area;
      if (area > largest) {
        largest = area;
        dpi = acrossDpi;
      }
    },
  });
  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  const pageArea = widthPt * heightPt;
  return { coverage: pageArea > 0 ? Math.min(1, covered / pageArea) : 0, imagePixels, dpi, widthPt, heightPt };
}

/** A rectangle on a learning grid, in pixels from the page's top-left. */
type GridRect = [number, number, number, number];

/**
 * Render only the page's image ops (what this module is able to edit), at
 * `scale` pixels per point. With `region`, only that part of the page.
 */
function renderImagesOnly(
  page: AnyPage,
  scale: number,
  region?: GridRect,
): { width: number; height: number; rgb: Uint8Array } {
  const bounds = page.getBounds();
  const rect: GridRect = region ?? [
    0,
    0,
    Math.round((bounds[2] - bounds[0]) * scale),
    Math.round((bounds[3] - bounds[1]) * scale),
  ];
  const width = rect[2] - rect[0];
  const height = rect[3] - rect[1];
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, rect, false);
  let draw: InstanceType<typeof mupdf.DrawDevice> | undefined;
  let device: InstanceType<typeof mupdf.Device> | undefined;
  try {
    pixmap.clear(255);
    draw = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
    const target = draw;
    device = new mupdf.Device({
      fillImage(image, ctm, alpha) {
        target.fillImage(image, ctm, alpha);
      },
    });
    page.run(device, [scale, 0, 0, scale, -bounds[0] * scale, -bounds[1] * scale]);
    device.close();
    device = undefined;
    draw.close();
    draw = undefined;
    return { width, height, rgb: new Uint8Array(pixmap.getPixels()) };
  } finally {
    try {
      device?.close();
    } catch { /* already closed */ }
    try {
      draw?.close();
    } catch { /* already closed */ }
    pixmap.destroy();
  }
}

/** Plane value for a pixel that is not blank paper. */
const NOT_PAPER = 0xff;

/** One page's blank-paper samples. */
interface PaperPlane {
  /** Darkness (255 - brightness) per pixel, or `NOT_PAPER`. */
  dark: Uint8Array;
  /** One bit per pixel: the sample was taken well clear of any ink. */
  clear: Uint8Array;
}

/**
 * Darkness of every pixel that would be blank paper but for a faint
 * overlay.
 *
 * Two grades are recorded. A "clear" sample has no ink anywhere near it, so
 * it is free of the ringing and soft edges compression leaves around text.
 * A plain sample only has no ink right next to it: noisier, but available
 * between the lines of a text-heavy page, where clear samples are rare.
 *
 * "Ink" is anything darker than `INK_LEVEL`. That is well below the darkest
 * stamp handled (a stamp of `MAX_OPACITY` over white paper is still
 * brighter), so the stamp itself is sampled, never mistaken for ink.
 */
function blankPaperDarkness(
  rgb: Uint8Array,
  w: number,
  h: number,
  pxPerRef: number,
  /** Per pixel: how many pages gave a sample, and how many of those samples
   *  had colour close by. Updated for this page. */
  tally: { samples: Uint8Array; besideColour: Uint8Array },
): PaperPlane {
  const n = w * h;
  const gray = new Float32Array(n);
  const white = new Float32Array(n);
  const ink = new Float32Array(n);
  const coloured = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const level = (r + g + b) / 3;
    gray[i] = level;
    white[i] = level >= PAPER_WHITE_LEVEL ? 1 : 0;
    ink[i] = level < INK_LEVEL ? 1 : 0;
    coloured[i] = Math.max(r, g, b) - Math.min(r, g, b) >= MAX_PAPER_SATURATION ? 1 : 0;
  }
  const mostlyWhite = boxMean(white, w, h, Math.max(2, Math.round(20 * pxPerRef)));
  const inkAround = boxMean(ink, w, h, Math.max(2, Math.round(12 * pxPerRef)));
  const inkBeside = boxMean(ink, w, h, Math.max(1, Math.round(3 * pxPerRef)));
  const colourAround = boxMean(coloured, w, h, Math.max(1, Math.round(4 * pxPerRef)));
  const colourBeside = boxMean(coloured, w, h, Math.max(1, Math.round(2 * pxPerRef)));
  const dark = new Uint8Array(n).fill(NOT_PAPER);
  const clear = new Uint8Array((n + 7) >> 3);
  for (let i = 0; i < n; i++) {
    if (!(mostlyWhite[i] > 0.55) || inkBeside[i] > NONE || colourBeside[i] > NONE) continue;
    if (tally.samples[i] < 255) {
      tally.samples[i]++;
      if (colourAround[i] > NONE) tally.besideColour[i]++;
    }
    // Not ink, so at most 255 - INK_LEVEL: never collides with NOT_PAPER.
    dark[i] = Math.round(255 - gray[i]);
    if (inkAround[i] < 0.004 && colourAround[i] <= NONE) clear[i >> 3] |= 1 << (i & 7);
  }
  return { dark, clear };
}

/** A connected faint mark in the learned darkness map. */
interface MarkCandidate {
  label: number;
  /** Summed darkness: how much the mark weighs. */
  mass: number;
  /** Tight box around the mark's own pixels. */
  box: [number, number, number, number];
}

/**
 * Connected faint marks in the learned darkness map, heaviest first, with
 * the label map that tells them apart. Nearby strokes (letters, lines of a
 * stamp) are joined into one mark by dilating before labelling.
 */
function findMarks(
  darkness: Float32Array,
  w: number,
  h: number,
  joinRadius: number,
): { candidates: MarkCandidate[]; label: Int32Array } {
  const seed = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) seed[i] = darkness[i] > MARK_LEVEL ? 1 : 0;
  const near = boxMean(seed, w, h, joinRadius);
  const label = new Int32Array(w * h);
  const candidates: MarkCandidate[] = [];
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (near[start] <= NONE || label[start] !== 0) continue;
    next++;
    let mass = 0;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      if (darkness[p] > 0) {
        // The box hugs the mark itself, not the margin added to join strokes.
        mass += darkness[p];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (x > 0 && near[p - 1] > NONE && label[p - 1] === 0) { label[p - 1] = next; stack.push(p - 1); }
      if (x < w - 1 && near[p + 1] > NONE && label[p + 1] === 0) { label[p + 1] = next; stack.push(p + 1); }
      if (y > 0 && near[p - w] > NONE && label[p - w] === 0) { label[p - w] = next; stack.push(p - w); }
      if (y < h - 1 && near[p + w] > NONE && label[p + w] === 0) { label[p + w] = next; stack.push(p + w); }
    }
    if (mass > 0) candidates.push({ label: next, mass, box: [x0, y0, x1 + 1, y1 + 1] });
  }
  candidates.sort((p, q) => q.mass - p.mass);
  return { candidates, label };
}

/**
 * Share of a mark's pixels that lie on long straight horizontal or vertical
 * runs. Rules, page frames and table grids are made of such runs; a stamp —
 * lettering, usually diagonal — is not.
 */
function straightRunShare(
  darkness: Float32Array,
  label: Int32Array,
  mark: MarkCandidate,
  w: number,
  minRun: number,
): number {
  const [x0, y0, x1, y1] = mark.box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const onRun = new Uint8Array(bw * bh);
  const isMark = (x: number, y: number): boolean => {
    const p = y * w + x;
    return label[p] === mark.label && darkness[p] > MARK_LEVEL;
  };
  let total = 0;
  for (let y = y0; y < y1; y++) {
    let runStart = -1;
    for (let x = x0; x <= x1; x++) {
      const inside = x < x1 && isMark(x, y);
      if (inside) {
        total++;
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        if (x - runStart >= minRun) onRun.fill(1, (y - y0) * bw + runStart - x0, (y - y0) * bw + x - x0);
        runStart = -1;
      }
    }
  }
  for (let x = x0; x < x1; x++) {
    let runStart = -1;
    for (let y = y0; y <= y1; y++) {
      const inside = y < y1 && isMark(x, y);
      if (inside) {
        if (runStart < 0) runStart = y;
      } else if (runStart >= 0) {
        if (y - runStart >= minRun) {
          for (let yy = runStart; yy < y; yy++) onRun[(yy - y0) * bw + x - x0] = 1;
        }
        runStart = -1;
      }
    }
  }
  if (total === 0) return 0;
  let straight = 0;
  for (let i = 0; i < onRun.length; i++) straight += onRun[i];
  return straight / total;
}

/**
 * Let whatever else is waiting on the event loop run. Learning reads dozens
 * of pages and takes seconds; without this, every other request to the
 * process (and the progress events of this one) would wait until it is done.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Stamps already learned, by PDF content (see `detectRasterWatermark`). */
const learnedStamps = new Map<string, RasterWatermark | null>();
const LEARNED_STAMPS_KEPT = 4;

/**
 * Learn a repeated stamp baked into the document's page images.
 *
 * Samples pages evenly over the whole document (independent of any
 * extraction page range, so partial extractions of the same PDF agree).
 * Resolves to null when the document has too few image pages or no
 * qualifying mark — never rejects.
 *
 * Learning reads up to a hundred pages and takes seconds, so it yields to
 * the event loop between pages. Pass `cacheKey` (something that identifies
 * the PDF's content) when the same document may be extracted again —
 * re-extracting two pages for a spread merge must not repeat it.
 */
export async function detectRasterWatermark(
  doc: MupdfDocument,
  cacheKey?: string,
): Promise<RasterWatermark | null> {
  if (cacheKey !== undefined) {
    const known = learnedStamps.get(cacheKey);
    if (known !== undefined) {
      // Refresh its place so the least recently used entry is the one evicted.
      learnedStamps.delete(cacheKey);
      learnedStamps.set(cacheKey, known);
      return known;
    }
  }
  let model: RasterWatermark | null;
  try {
    model = await learnRasterWatermark(doc);
  } catch (err) {
    // Not remembered: a failure says nothing about the document.
    console.warn(
      "[pdf] raster watermark detection failed, continuing without it:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (cacheKey !== undefined) {
    learnedStamps.set(cacheKey, model);
    if (learnedStamps.size > LEARNED_STAMPS_KEPT) {
      const oldest = learnedStamps.keys().next().value;
      if (oldest !== undefined) learnedStamps.delete(oldest);
    }
  }
  return model;
}

/** What one learning pass found on (a region of) the page grid. */
interface LearnedMarks {
  /** The part of the page grid that was learned. */
  region: GridRect;
  width: number;
  height: number;
  /** Darkness above the paper level per region pixel; 0 where there is none. */
  darkness: Float32Array;
  /** Brightness of blank paper. */
  paperLevel: number;
  tally: { samples: Uint8Array; besideColour: Uint8Array };
  /** Pages the pass actually used. */
  pages: number[];
}

/**
 * One learning pass: the darkness that is the same on every page, measured
 * as the median, at each pixel, over the pages where that pixel is blank
 * paper. `pageSize` is the page's size on this grid; pages that round to a
 * different size are skipped, since the stamp would sit a pixel off.
 */
async function learnMarks(
  doc: MupdfDocument,
  pages: number[],
  scale: number,
  pageSize: { width: number; height: number },
  region: GridRect | undefined,
  /** Paper brightness from an earlier whole-page pass. A region cropped to
   *  the stamp may be mostly stamp, and cannot measure its own paper. */
  knownPaperLevel?: number,
): Promise<LearnedMarks | null> {
  const rect: GridRect = region ?? [0, 0, pageSize.width, pageSize.height];
  const width = rect[2] - rect[0];
  const height = rect[3] - rect[1];
  if (width < 8 || height < 8) return null;
  const pxPerRef = (scale * 72) / REFERENCE_DPI;
  const tally = { samples: new Uint8Array(width * height), besideColour: new Uint8Array(width * height) };
  const planes: PaperPlane[] = [];
  const used: number[] = [];
  for (const index of pages) {
    await yieldToEventLoop();
    try {
      const page = doc.loadPage(index);
      const bounds = page.getBounds();
      if (
        Math.round((bounds[2] - bounds[0]) * scale) !== pageSize.width ||
        Math.round((bounds[3] - bounds[1]) * scale) !== pageSize.height
      ) {
        continue;
      }
      const rendered = renderImagesOnly(page, scale, rect);
      planes.push(blankPaperDarkness(rendered.rgb, width, height, pxPerRef, tally));
      used.push(index);
    } catch {
      continue; // one broken page must not disable detection
    }
  }
  if (planes.length < MIN_IMAGE_PAGES) return null;

  // Clear samples decide wherever there are enough of them; elsewhere every
  // sample is used, taking a lower quantile because what contaminates the
  // noisier ones (soft text edges) only ever makes a pixel darker.
  const minObservations = Math.max(4, Math.min(8, Math.floor(planes.length / 3)));
  const level = new Float32Array(width * height).fill(-1);
  const clearSamples = new Uint8Array(planes.length);
  const allSamples = new Uint8Array(planes.length);
  /**
   * The stamp's darkness among sorted samples that also include pages where
   * it is hidden: a stamp drawn under a white box leaves plain white there,
   * and enough such pages would outvote the stamp. The stamp is then the
   * darker group — recognisable because it is the same on every page, where
   * stray darkness (soft text edges) is not. Returns -1 when there is no
   * such group.
   */
  const hiddenStampLevel = (sorted: Uint8Array, count: number): number => {
    const paper = sorted[count >> 2];
    let first = 0;
    while (first < count && sorted[first] <= paper + STAMP_GROUP_GAP) first++;
    const size = count - first;
    // A real share of the samples, not just a few pages: something that
    // recurs on a handful of pages (a chapter-opening ornament) is content.
    if (size < minObservations || size < count * MIN_STAMP_GROUP_SHARE) return -1;
    const middle = sorted[first + (size >> 1)];
    const spread = sorted[first + Math.floor(size * 0.75)] - sorted[first + (size >> 2)];
    return spread <= Math.max(6, middle * 0.2) ? middle : -1;
  };
  for (let p = 0; p < width * height; p++) {
    let clearCount = 0;
    let allCount = 0;
    for (let k = 0; k < planes.length; k++) {
      const v = planes[k].dark[p];
      if (v === NOT_PAPER) continue;
      allSamples[allCount++] = v;
      if ((planes[k].clear[p >> 3] >> (p & 7)) & 1) clearSamples[clearCount++] = v;
    }
    if (clearCount >= minObservations) {
      const sorted = clearSamples.subarray(0, clearCount).sort();
      const stamp = hiddenStampLevel(sorted, clearCount);
      level[p] = stamp >= 0
        ? stamp
        : clearCount % 2 === 1
          ? sorted[clearCount >> 1]
          : (sorted[clearCount / 2 - 1] + sorted[clearCount / 2]) / 2;
    } else if (allCount >= minObservations) {
      const sorted = allSamples.subarray(0, allCount).sort();
      const stamp = hiddenStampLevel(sorted, allCount);
      level[p] = stamp >= 0 ? stamp : sorted[Math.floor(allCount * 0.4)];
    }
  }

  // Scanned paper is rarely pure white. Most blank-paper pixels carry no
  // mark, so their median is the paper itself; a mark is what is darker than
  // that.
  let paperDarkness: number;
  if (knownPaperLevel !== undefined) {
    paperDarkness = 255 - knownPaperLevel;
  } else {
    const paperSamples: number[] = [];
    for (let p = 0; p < width * height; p += 7) if (level[p] >= 0) paperSamples.push(level[p]);
    if (paperSamples.length === 0) return null;
    paperDarkness = medianOf(Float32Array.from(paperSamples));
  }
  const darkness = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const above = level[p] - paperDarkness;
    if (above >= NOISE_FLOOR) darkness[p] = above;
  }
  return { region: rect, width, height, darkness, paperLevel: 255 - paperDarkness, tally, pages: used };
}

/**
 * The heaviest learned mark that looks like a stamp, as an opacity map.
 * Heavier page furniture — a footer rule, a page frame, a table grid — is
 * passed over rather than taken for the watermark or allowed to hide a
 * fainter real one. `pageSize` is the whole page on this grid.
 */
function chooseStamp(
  learned: LearnedMarks,
  pageSize: { width: number; height: number },
  pxPerRef: number,
): { box: GridRect; opacity: Float32Array; peak: number } | null {
  const { width, height, darkness, tally, region } = learned;
  const { candidates, label } = findMarks(darkness, width, height, Math.max(2, Math.round(15 * pxPerRef)));
  const minSide = Math.max(8, Math.round(MIN_MARK_SIDE * pxPerRef));
  const minRun = Math.max(12, Math.round(STRAIGHT_RUN_SHARE_OF_PAGE * Math.min(pageSize.width, pageSize.height)));
  const pageDiagonal = Math.hypot(pageSize.width, pageSize.height);
  for (const mark of candidates.slice(0, MAX_MARKS_CONSIDERED)) {
    const [bx0, by0, bx1, by1] = mark.box;
    const boxW = bx1 - bx0;
    const boxH = by1 - by0;
    if (Math.min(boxW, boxH) < minSide) continue;
    if (Math.hypot(boxW, boxH) / pageDiagonal < MIN_DIAGONAL_RATIO) continue;
    if (straightRunShare(darkness, label, mark, width, minRun) > MAX_STRAIGHT_RUN_SHARE) continue;

    // Opacity is the share of the paper's brightness the mark removed.
    const opacity = new Float32Array(boxW * boxH);
    let peak = 0;
    let samples = 0;
    let besideColour = 0;
    for (let y = 0; y < boxH; y++) {
      for (let x = 0; x < boxW; x++) {
        const p = (y + by0) * width + x + bx0;
        if (label[p] !== mark.label) continue; // unrelated faint marks inside the box
        const a = Math.min(MAX_OPACITY, darkness[p] / learned.paperLevel);
        opacity[y * boxW + x] = a;
        if (a > peak) peak = a;
        if (darkness[p] > MARK_LEVEL) {
          samples += tally.samples[p];
          besideColour += tally.besideColour[p];
        }
      }
    }
    if (peak < MIN_PEAK_OPACITY) continue;
    // A coloured stamp is out of scope, but the soft grey fringe of its
    // letters looks like a faint neutral mark. The giveaway is that the
    // blank-paper samples it was learned from nearly all had colour close
    // by (the stamp's own body), where a grey stamp's samples rarely do.
    if (samples === 0 || besideColour / samples > MAX_SHARE_BESIDE_COLOUR) continue;
    return {
      box: [bx0 + region[0], by0 + region[1], bx1 + region[0], by1 + region[1]],
      opacity,
      peak,
    };
  }
  return null;
}

async function learnRasterWatermark(doc: MupdfDocument): Promise<RasterWatermark | null> {
  const totalPages = doc.countPages();
  if (totalPages < MIN_IMAGE_PAGES) return null;

  // Cheap gate first: a document with no image pages stops here.
  const measured = new Map<number, PageImageCoverage>();
  const isImagePage = (index: number): boolean => {
    let info = measured.get(index);
    if (!info) {
      try {
        info = measureImageCoverage(doc.loadPage(index));
      } catch {
        info = { coverage: 0, imagePixels: 0, dpi: 0, widthPt: 0, heightPt: 0 };
      }
      measured.set(index, info);
    }
    return info.coverage >= IMAGE_PAGE_MIN_COVERAGE && info.dpi > 0;
  };
  // At least two of them: one stray picture page in a long vector document
  // would otherwise send every candidate page through the same check, and
  // interpreting a heavy vector page is slow.
  let pictured = 0;
  for (const index of spreadPageIndices(totalPages, PRECHECK_PAGES)) {
    if (isImagePage(index)) pictured++;
    await yieldToEventLoop();
  }
  if (pictured < 2) return null;

  // A stamp sits at one position on one page size, so learn from the pages
  // of the most common size. Covers and inserts are often a different size
  // and must not decide (or sink) the grid.
  const bySize = new Map<string, number[]>();
  for (const index of spreadPageIndices(totalPages, MAX_CANDIDATE_PAGES)) {
    if (!measured.has(index)) await yieldToEventLoop();
    if (!isImagePage(index)) continue;
    const info = measured.get(index) as PageImageCoverage;
    const key = `${Math.round(info.widthPt * 2)}x${Math.round(info.heightPt * 2)}`;
    const group = bySize.get(key);
    if (group) group.push(index);
    else bySize.set(key, [index]);
  }
  let imagePages: number[] = [];
  for (const group of bySize.values()) if (group.length > imagePages.length) imagePages = group;
  if (imagePages.length < MIN_IMAGE_PAGES) return null;
  imagePages.sort((a, b) => a - b);

  const sizeOf = measured.get(imagePages[0]) as PageImageCoverage;
  const pageArea = sizeOf.widthPt * sizeOf.heightPt;
  const pageSizeAt = (scale: number): { width: number; height: number } => ({
    width: Math.round(sizeOf.widthPt * scale),
    height: Math.round(sizeOf.heightPt * scale),
  });
  // Rendering a page means decoding its images, and big scans are slow to
  // decode. The pages read are capped by pixels (not by time, which would
  // make the result depend on the machine).
  const pixelsPerPage = medianOf(Float32Array.from(imagePages.map((i) => measured.get(i)?.imagePixels ?? 0)));
  const affordable = Math.max(2 * MIN_IMAGE_PAGES, Math.floor(LEARN_DECODE_BUDGET / Math.max(1, pixelsPerPage)));
  /** As many pages as the memory and decoding budgets allow for planes of this size. */
  const pagesFor = (planePixels: number): number[] => {
    const count = Math.min(
      affordable,
      Math.max(MIN_IMAGE_PAGES, Math.floor(LEARN_BUDGET_BYTES / Math.max(1, planePixels * 1.125))),
    );
    return imagePages.length <= count
      ? imagePages
      : spreadPageIndices(imagePages.length, count).map((i) => imagePages[i]);
  };

  // The stamp has to be learned on the scans' own pixel grid: any other grid
  // resamples it and blurs its edges, which leaves an outline behind. Whole
  // pages at that resolution may not fit the budget, so the stamp is first
  // located on a grid that does, and then learned at full resolution inside
  // the box that was found.
  const dpis = Float32Array.from(imagePages.map((i) => measured.get(i)?.dpi ?? 0));
  const nativeScale = Math.min(MAX_NATIVE_DPI, Math.max(36, medianOf(dpis))) / 72;
  const locateScale = Math.min(nativeScale, Math.sqrt(LOCATE_PIXELS / Math.max(1, pageArea)));

  let scale = locateScale;
  let pageSize = pageSizeAt(scale);
  let learned = await learnMarks(doc, pagesFor(pageSize.width * pageSize.height), scale, pageSize, undefined);
  if (!learned) return null;
  let stamp = chooseStamp(learned, pageSize, (scale * 72) / REFERENCE_DPI);
  if (!stamp) return null;

  // The fine grid is the scans' own unless the stamp box would then be too
  // many pixels to work on: removal holds dozens of buffers that size.
  const coarseBoxPixels = (stamp.box[2] - stamp.box[0]) * (stamp.box[3] - stamp.box[1]);
  const fineScale = Math.min(nativeScale, locateScale * Math.sqrt(MAX_STAMP_PIXELS / Math.max(1, coarseBoxPixels)));
  if (fineScale > locateScale * 1.01) {
    const nativeScale = fineScale;
    const fineSize = pageSizeAt(nativeScale);
    const grow = nativeScale / locateScale;
    const margin = Math.round(24 * ((nativeScale * 72) / REFERENCE_DPI));
    const region: GridRect = [
      Math.max(0, Math.floor(stamp.box[0] * grow) - margin),
      Math.max(0, Math.floor(stamp.box[1] * grow) - margin),
      Math.min(fineSize.width, Math.ceil(stamp.box[2] * grow) + margin),
      Math.min(fineSize.height, Math.ceil(stamp.box[3] * grow) + margin),
    ];
    const regionPixels = (region[2] - region[0]) * (region[3] - region[1]);
    const fine = await learnMarks(doc, pagesFor(regionPixels), nativeScale, fineSize, region, learned.paperLevel);
    const fineStamp = fine ? chooseStamp(fine, fineSize, (nativeScale * 72) / REFERENCE_DPI) : null;
    // The fine pass reads fewer pages, so it can come up empty or with holes
    // where too few of them show blank paper. A sharper stamp that is missing
    // parts is worse than a softer whole one, so it must weigh about as much.
    const weigh = (opacity: Float32Array): number => opacity.reduce((sum, a) => sum + a, 0);
    if (fine && fineStamp && weigh(fineStamp.opacity) >= 0.8 * weigh(stamp.opacity) * grow * grow) {
      scale = nativeScale;
      pageSize = fineSize;
      learned = fine;
      stamp = fineStamp;
    }
  }

  // What the stamp did to colour, and whether it shows over coloured content
  // or was drawn under it, pooled over a spread of pages so images that
  // cannot tell borrow the document's answer. With no coloured content
  // anywhere the values are never consulted where it matters: a plain
  // multiply is the textbook blend, and a stamp is normally on top.
  const draft = { scale, box: stamp.box, opacity: stamp.opacity };
  const margin = Math.round(16 * ((scale * 72) / REFERENCE_DPI));
  const around: GridRect = [
    Math.max(0, stamp.box[0] - margin),
    Math.max(0, stamp.box[1] - margin),
    Math.min(pageSize.width, stamp.box[2] + margin),
    Math.min(pageSize.height, stamp.box[3] + margin),
  ];
  const aroundW = around[2] - around[0];
  const aroundH = around[3] - around[1];
  let fadeSum = 0;
  let fadeEvidence = 0;
  let overSum = 0;
  let overEvidence = 0;
  let replacedSum = 0;
  let replacedEvidence = 0;
  let darkensSum = 0;
  let darkensEvidence = 0;
  const usedPages = learned.pages;
  for (const index of spreadPageIndices(usedPages.length, COLOUR_FIT_PAGES).map((i) => usedPages[i])) {
    await yieldToEventLoop();
    try {
      const rendered = renderImagesOnly(doc.loadPage(index), scale, around);
      const fit = fitStamp(rendered.rgb, aroundW, aroundH, 3, [aroundW, 0, 0, aroundH, around[0], around[1]], draft, 1, true);
      if (!fit) continue;
      // Pages where the stamp shows nowhere still count: a stamp hidden
      // under every picture is exactly what `overContent` is asking about.
      overSum += fit.overContent * fit.overContentEvidence;
      overEvidence += fit.overContentEvidence;
      replacedSum += fit.replacedShare * fit.replacedEvidence;
      replacedEvidence += fit.replacedEvidence;
      darkensSum += fit.darkensContent * fit.darkensContentEvidence;
      darkensEvidence += fit.darkensContentEvidence;
      if (fit.colourEvidence <= fit.colourEvidenceNeeded) continue;
      fadeSum += fit.colourFade * fit.colourEvidence;
      fadeEvidence += fit.colourEvidence;
    } catch {
      continue;
    }
  }
  const colourFade = fadeEvidence > 0 ? fadeSum / fadeEvidence : 1;
  // Is the stamp an opaque grey that replaced the coloured content under
  // it? One page cannot say: the white gaps of a picture drawn over a
  // hidden stamp look much the same. Across the document the two differ
  // plainly, so the answer is settled here and each image follows it.
  const replacesContent = replacedEvidence > 0 ? replacedSum / replacedEvidence : 0;
  // Replaced strokes count as showing over content only if the document is
  // of that kind; otherwise they were look-alikes and are left out.
  const overContent = replacesContent >= REPLACES_CONTENT_MIN
    ? (overEvidence > 0 ? overSum / overEvidence : 1)
    : (darkensEvidence > 0 ? darkensSum / darkensEvidence : 1);

  return {
    ...draft,
    peakOpacity: Math.round(stamp.peak * 1000) / 1000,
    colourFade: Math.round(colourFade * 100) / 100,
    overContent: Math.round(overContent * 100) / 100,
    replacesContent: Math.round(replacesContent * 100) / 100,
    pagesSampled: usedPages.length,
  };
}

// ── Removal ─────────────────────────────────────────────────────────────

/** Bilinear sample of the stamp opacity at a learning-grid position. */
function sampleOpacity(model: Pick<RasterWatermark, "box" | "opacity">, x: number, y: number): number {
  const [bx0, by0, bx1, by1] = model.box;
  const boxW = bx1 - bx0;
  // Learning-grid pixel centres sit at +0.5.
  const fx = x - 0.5 - bx0;
  const fy = y - 0.5 - by0;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const boxH = by1 - by0;
  const at = (xx: number, yy: number): number =>
    xx < 0 || yy < 0 || xx >= boxW || yy >= boxH ? 0 : model.opacity[yy * boxW + xx];
  return (
    (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
    (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
  );
}

/** Everything measured about the stamp in one image, ready to be undone. */
interface StampFit {
  /** Image-pixel rectangle that overlaps the stamp. */
  rx0: number;
  ry0: number;
  rw: number;
  rh: number;
  /** Image pixels per reference pixel, for sizing filter windows. */
  pxPerRef: number;
  /** Stamp opacity per pixel of the rectangle (0 where the stamp is not). */
  alpha: Float32Array;
  /** Brightness per pixel of the rectangle, as seen. */
  luma: Float32Array;
  /** Colour kind per pixel: 0 neutral (paper, grey, ink), 1 coloured. */
  kind: Uint8Array;
  /**
   * How much of the stamp shows at each pixel: 1 where it darkens the page,
   * 0 where page content (a picture, a filled box) was drawn over it.
   */
  presence: Float32Array;
  /**
   * 1 where the stamp is an opaque grey that replaced coloured content.
   * Nothing of the original is left under it there, so those pixels (and a
   * thin rim around them) are filled in from what surrounds them instead of
   * divided. `fill` is the average colour around, the fallback fill.
   */
  replaced: Uint8Array;
  fill: { luma: Float32Array; red: Float32Array; blue: Float32Array };
  /** False when the stamp shows nowhere in this image: nothing to undo. */
  shows: boolean;
  /** How strongly the stamp is present where it shows (1 = as learned). */
  strength: number;
  /** Measured colour fade and how much evidence there was for it. */
  colourFade: number;
  colourEvidence: number;
  /** Evidence needed before `colourFade` can be trusted. */
  colourEvidenceNeeded: number;
  /** Whether the stamp shows over coloured content here (0..1), and the
   *  weight of evidence behind that. */
  overContent: number;
  overContentEvidence: number;
  /** The same, counting only strokes that darken the content (leaving out
   *  any judged to have replaced it). */
  darkensContent: number;
  darkensContentEvidence: number;
  /** Share of the stamp among coloured content that looks like an opaque
   *  grey replacing it, and the weight of stamp that share is of. */
  replacedShare: number;
  replacedEvidence: number;
}

/**
 * How strongly the stamp is present in the image taken as a whole (1 = as
 * learned, 0 = absent): the slope of the image's fine brightness detail on
 * the stamp's. The slope minimising absolute error is the weighted median
 * of the per-pixel ratios, which holds up until half the evidence is
 * content rather than stamp, so it works on a busy picture where no single
 * neighbourhood can tell. Pixels near ink are left out: ink is far darker
 * than any stamp and the detail filter spreads it around.
 */
function wholeImageStrength(
  alpha: Float32Array,
  stampDensity: Float32Array,
  luma: Float32Array,
  rw: number,
  rh: number,
  pxPerRef: number,
): number {
  const n = rw * rh;
  const detailRadius = Math.max(1, Math.round(4 * pxPerRef));
  const density = new Float32Array(n);
  const ink = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    density[i] = -Math.log(Math.max(8, luma[i]) / 255);
    ink[i] = luma[i] / (1 - alpha[i]) < INK_LEVEL ? 1 : 0;
  }
  const stampDetail = highPass(stampDensity, rw, rh, detailRadius);
  const lumaDetail = highPass(density, rw, rh, detailRadius);
  const inkNearby = boxMean(ink, rw, rh, 3 * detailRadius);
  const collect = (calmOnly: boolean): { ratios: Array<[number, number]>; total: number } => {
    const ratios: Array<[number, number]> = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const weight = Math.abs(stampDetail[i]);
      if (weight < 0.01 || (calmOnly && inkNearby[i] > NONE)) continue;
      ratios.push([lumaDetail[i] / stampDetail[i], weight]);
      total += weight;
    }
    return { ratios, total };
  };
  let { ratios, total } = collect(true);
  if (ratios.length < MIN_STAMP_PIXELS) ({ ratios, total } = collect(false));
  if (ratios.length < MIN_STAMP_PIXELS) return 0;
  ratios.sort((p, q) => p[0] - q[0]);
  let running = 0;
  for (const [ratio, weight] of ratios) {
    running += weight;
    if (running >= total / 2) return ratio;
  }
  return 0;
}

/**
 * Measure the stamp in one image: where it falls, where it actually shows,
 * and what it did to colour. `toGrid` maps the image's unit square (top-left
 * origin) onto the learning grid, so the stamp is evaluated at each image
 * pixel's own position. `overContentPrior` is the document's answer to
 * "does the stamp show over coloured content?", used where this image
 * cannot tell. Returns null when the image does not overlap the stamp;
 * `shows` is false when it overlaps but the stamp shows nowhere in it.
 */
function fitStamp(
  pixels: Uint8Array,
  width: number,
  height: number,
  components: number,
  toGrid: readonly number[],
  model: Pick<RasterWatermark, "scale" | "box" | "opacity">,
  overContentPrior: number,
  /** Whether strokes that look like an opaque grey over colour are filled
   *  in. Decided for the document as a whole: see `replacesContent`. */
  fillReplaced: boolean,
): StampFit | null {
  const [a, b, c, d, e, f] = toGrid;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;

  // Image-pixel rectangle that can see the stamp box.
  const toImage = (gx: number, gy: number): [number, number] => [
    ((d * (gx - e) - c * (gy - f)) / det) * width,
    ((-b * (gx - e) + a * (gy - f)) / det) * height,
  ];
  const [bx0, by0, bx1, by1] = model.box;
  const corners = [toImage(bx0, by0), toImage(bx1, by0), toImage(bx0, by1), toImage(bx1, by1)];
  const rx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))));
  const rx1 = Math.min(width, Math.ceil(Math.max(...corners.map((p) => p[0]))));
  const ry0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
  const ry1 = Math.min(height, Math.ceil(Math.max(...corners.map((p) => p[1]))));
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  if (rw < 8 || rh < 8) return null;
  // Dozens of buffers this size are alive at once below. An image far
  // sharper than the grid the stamp was learned on is left alone rather
  // than risk the process running out of memory.
  if (rw * rh > 2 * MAX_STAMP_PIXELS) return null;

  // Image pixels per reference pixel, for sizing the filter windows.
  const pxPerGrid = Math.sqrt((width * height) / Math.abs(det));
  const pxPerRef = (pxPerGrid * model.scale * 72) / REFERENCE_DPI;

  const n = rw * rh;
  const alpha = new Float32Array(n);
  const stampDensity = new Float32Array(n);
  let stampPixels = 0;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const u = (rx0 + x + 0.5) / width;
      const v = (ry0 + y + 0.5) / height;
      const opacity = Math.min(MAX_OPACITY, sampleOpacity(model, a * u + c * v + e, b * u + d * v + f));
      if (opacity <= 0) continue;
      const i = y * rw + x;
      alpha[i] = opacity;
      stampDensity[i] = -Math.log(1 - opacity);
      stampPixels++;
    }
  }
  if (stampPixels < MIN_STAMP_PIXELS) return null;

  // Brightness (luma) and the two colour-difference signals of the region.
  const isColour = components >= 3;
  const luma = new Float32Array(n);
  const chroma: Float32Array[] = isColour ? [new Float32Array(n), new Float32Array(n)] : [];
  // Colour kind of every pixel: 0 neutral (paper, grey), 1 coloured.
  const kind = new Uint8Array(n);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      const level = isColour
        ? LUMA_R * pixels[q] + LUMA_G * pixels[q + 1] + LUMA_B * pixels[q + 2]
        : pixels[q];
      luma[i] = level;
      if (isColour) {
        const red = pixels[q] - level;
        const blue = pixels[q + 2] - level;
        chroma[0][i] = red;
        chroma[1][i] = blue;
        if (Math.abs(red) >= NEUTRAL_CHROMA || Math.abs(blue) >= NEUTRAL_CHROMA) kind[i] = 1;
      }
    }
  }

  // 1. Where does the stamp actually show? A stamp drawn under a picture or
  //    a filled box is hidden there, and undoing it anyway would leave a
  //    bright ghost of its letters on that object. So each stamp pixel is
  //    compared with the unstamped pixels of its own colour kind around it:
  //    if it is darker than them by the stamp's share, the stamp shows.
  //
  //    References are kept per colour kind so that paper next to a coloured
  //    box is judged against paper, and ink is left out of them so text on
  //    the paper does not drag the reference down.
  const kinds = isColour ? 2 : 1;
  // Darkest pixel that still counts: neutral ones below this are ink, but a
  // saturated red or blue is that dark and is content all the same.
  const floors = [INK_LEVEL, DARK_COLOUR_LEVEL];
  const referenceRadius = Math.max(3, Math.round(8 * pxPerRef));
  // The stamp and a thin rim around it. Compression smears a stroke a pixel
  // or two past its learned edge, so the rim is neither a clean reference
  // nor, where a stroke is filled in, something to leave behind.
  const inStamp = new Float32Array(n);
  for (let i = 0; i < n; i++) if (alpha[i] > 0) inStamp[i] = 1;
  const zone = boxMean(inStamp, rw, rh, Math.max(1, Math.round(1.5 * pxPerRef)));
  // Unstamped pixels of each colour kind around every pixel. A close-by
  // window is the better witness, but the middle of a thick stroke is too
  // far from anything unstamped for it, so a wider one stands in there.
  const witnesses = (radius: number, k: number): { share: Float32Array; level: Float32Array; spread: Float32Array; tints: Float32Array[] } => {
    const member = new Float32Array(n);
    const sum = new Float32Array(n);
    const squares = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (zone[i] > NONE || kind[i] !== k || luma[i] < floors[k]) continue;
      member[i] = 1;
      sum[i] = luma[i];
      squares[i] = luma[i] * luma[i];
    }
    const share = boxMean(member, rw, rh, radius);
    const level = boxMean(sum, rw, rh, radius);
    const spread = boxMean(squares, rw, rh, radius);
    const tints = k === 1
      ? chroma.map((plane) => {
          const masked = new Float32Array(n);
          for (let i = 0; i < n; i++) if (member[i] === 1) masked[i] = plane[i];
          return boxMean(masked, rw, rh, radius);
        })
      : [];
    return { share, level, spread, tints };
  };
  const reference: Array<{ share: Float32Array; level: Float32Array; spread: Float32Array }> = [];
  // Colour of the coloured surroundings, for filling in what an opaque
  // stamp replaced (see below).
  const fill: StampFit["fill"] = {
    luma: new Float32Array(0),
    red: new Float32Array(0),
    blue: new Float32Array(0),
  };
  for (let k = 0; k < kinds; k++) {
    const near = witnesses(referenceRadius, k);
    const far = witnesses(referenceRadius * 2, k);
    const share = new Float32Array(n);
    const level = new Float32Array(n);
    const spread = new Float32Array(n);
    const tints = near.tints.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const from = near.share[i] >= NEAR_REFERENCE_SHARE ? near : far;
      if (from.share[i] < MIN_REFERENCE_SHARE) continue;
      share[i] = from.share[i];
      level[i] = from.level[i] / from.share[i];
      for (let t = 0; t < tints.length; t++) tints[t][i] = from.tints[t][i] / from.share[i];
      // Relative variance of the reference: high in pictures and at edges.
      spread[i] = Math.max(0, from.spread[i] / from.share[i] - level[i] * level[i]) / (level[i] * level[i]);
    }
    if (k === 1) {
      fill.luma = level;
      fill.red = tints[0];
      fill.blue = tints[1];
    }
    reference.push({ share, level, spread });
  }

  // Some stamps are not a darkening at all but an opaque grey drawn over the
  // content. On paper the two look the same, and dividing restores the
  // white. Over a coloured box the opaque kind leaves a grey letter with
  // none of the box's colour in it, and dividing that gives a white letter.
  // Such a pixel gives itself away: it is neutral, exactly as bright as the
  // stamp is on paper, and surrounded by colour. One pixel proves little (a
  // white detail on a box can match by chance), so the verdict is pooled
  // along the stroke.
  const replaced = new Uint8Array(n);
  // 1 on every pixel of a stroke that replaced content, filled in or not:
  // none of them is a darkening, so none is divided.
  const inReplacedStroke = new Uint8Array(n);
  // 1 where a stamp pixel sits among coloured content rather than on paper.
  const amongColour = new Uint8Array(n);
  // Weight of the stamp pixels among colour, and of those in strokes judged
  // to have replaced it.
  let amongColourWeight = 0;
  let replacedWeight = 0;
  // Paper nearby, judged strictly: the soft grey edges of text are neutral
  // too, and text on a coloured box must not make the box look like paper.
  const paper = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (zone[i] <= NONE && kind[i] === 0 && luma[i] >= PAPER_LIKE_LEVEL) paper[i] = 1;
    if (alpha[i] > peak) peak = alpha[i];
  }
  const paperShare = boxMean(paper, rw, rh, referenceRadius);
  // Brightness of that paper, the reference for stamp pixels that sit on it.
  // Plain "neutral" would do on an empty page, but between lines of text the
  // soft grey edges of the letters drag such a reference down, and the stamp
  // then looks fainter than it is.
  const paperLevel = new Float32Array(n);
  {
    const masked = new Float32Array(n);
    for (let i = 0; i < n; i++) if (paper[i] === 1) masked[i] = luma[i];
    const sum = boxMean(masked, rw, rh, referenceRadius);
    for (let i = 0; i < n; i++) if (paperShare[i] >= MIN_PAPER_SHARE) paperLevel[i] = sum[i] / paperShare[i];
  }
  if (isColour) {
    // Is the nearest unstamped surface paper or colour? Asked at growing
    // distances, so a stroke at the edge of a box is judged by what it
    // touches rather than by which side has more pixels in a wide window.
    const colour = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (zone[i] <= NONE && kind[i] === 1 && luma[i] >= DARK_COLOUR_LEVEL) colour[i] = 1;
    }
    const rings = [Math.max(2, Math.round(referenceRadius / 2)), referenceRadius, referenceRadius * 2].map(
      (radius) => ({
        paper: radius === referenceRadius ? paperShare : boxMean(paper, rw, rh, radius),
        colour: boxMean(colour, rw, rh, radius),
      }),
    );
    const votes = new Float32Array(n);
    const voters = new Float32Array(n);
    const greyCore = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (zone[i] <= NONE) continue;
      if (reference[1].level[i] >= DARK_COLOUR_LEVEL) {
        for (const ring of rings) {
          if (ring.paper[i] + ring.colour[i] < REPLACED_MIN_SURFACE_SHARE) continue;
          amongColour[i] = ring.colour[i] > ring.paper[i] ? 1 : 0;
          break;
        }
      }
      if (amongColour[i] === 0 || alpha[i] < MIN_EVIDENCE_OPACITY) continue;
      const onPaperLevel = luma[i] / (1 - alpha[i]);
      // Text over the stamp says nothing either way.
      if (kind[i] === 0 && onPaperLevel < INK_LEVEL) continue;
      const weight = stampDensity[i] * stampDensity[i];
      voters[i] = weight;
      // Compression smears the surrounding colour into a thin grey stroke,
      // so "neutral" is judged against how coloured the surroundings are.
      const tint = Math.abs(chroma[0][i]) + Math.abs(chroma[1][i]);
      const tintAround = Math.abs(fill.red[i]) + Math.abs(fill.blue[i]);
      // Over a pale tint a plain darkening washes the colour out just as
      // far, so pale surroundings cannot tell the two apart and do not vote.
      if (tintAround < MIN_TELLING_TINT) {
        voters[i] = 0;
        continue;
      }
      const washedOut = kind[i] === 0 || tint <= tintAround * 0.5;
      if (washedOut && onPaperLevel >= REPLACED_LEVEL_FROM && onPaperLevel <= REPLACED_LEVEL_TO) {
        votes[i] = weight;
        greyCore[i] = 1;
      }
    }
    // All or nothing along a stroke: a half-filled letter is worse than
    // either outcome.
    const pooledVotes = boxMean(votes, rw, rh, referenceRadius);
    const pooledVoters = boxMean(voters, rw, rh, referenceRadius);
    // What gets filled in is the grey itself plus the soft rim around it,
    // not everything near the stroke: text printed over the stamp, and any
    // part of a picture the stroke did not reach, are still good.
    const nearGrey = boxMean(greyCore, rw, rh, Math.max(1, Math.round(2 * pxPerRef)));
    const darkestStamp = 255 * (1 - peak) - 25;
    for (let i = 0; i < n; i++) {
      amongColourWeight += voters[i];
      if (amongColour[i] === 0 || pooledVoters[i] <= NONE) continue;
      if (pooledVotes[i] / pooledVoters[i] < REPLACED_MIN_VOTE) continue;
      replacedWeight += voters[i];
      if (!fillReplaced) continue;
      inReplacedStroke[i] = 1;
      if (nearGrey[i] > NONE && luma[i] >= Math.min(darkestStamp, fill.luma[i] - 25)) replaced[i] = 1;
    }
  }

  // Per-pixel evidence (0 = hidden, 1 = shows) and how far to trust it:
  // strong opacity over a flat reference is worth far more than a faint
  // edge or a busy picture.
  const evidence = new Float32Array(n);
  const trust = new Float32Array(n);
  const evidenceTotal = [0, 0];
  const trustTotal = [0, 0];
  // 1 where a stamp pixel sits on paper: neutral, paper close by, and bright
  // enough to be paper under the stamp (a grey photograph next to the margin
  // is not).
  const onPaper = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (alpha[i] < MIN_EVIDENCE_OPACITY) {
      if (alpha[i] > 0 && kind[i] === 0 && amongColour[i] === 0 && paperLevel[i] > 0) onPaper[i] = 1;
      continue;
    }
    if (inReplacedStroke[i] === 1) continue;
    const k = isColour ? kind[i] : 0;
    const undone = luma[i] / (1 - alpha[i]);
    if (k === 0 && amongColour[i] === 0 && paperLevel[i] > 0 && undone >= PAPER_LIKE_LEVEL - 15) {
      onPaper[i] = 1;
      const seen = Math.log(paperLevel[i] / Math.max(4, luma[i])) / stampDensity[i];
      evidence[i] = Math.min(1.5, Math.max(-0.5, seen));
      trust[i] = (stampDensity[i] * stampDensity[i]) / (REFERENCE_NOISE * REFERENCE_NOISE);
      evidenceTotal[0] += trust[i] * evidence[i];
      trustTotal[0] += trust[i];
      continue;
    }
    const ref = reference[k];
    if (ref.level[i] < floors[k] || undone < floors[k]) continue;
    const seen = Math.log(ref.level[i] / Math.max(4, luma[i])) / stampDensity[i];
    evidence[i] = Math.min(1.5, Math.max(-0.5, seen));
    trust[i] = (stampDensity[i] * stampDensity[i]) / (ref.spread[i] + REFERENCE_NOISE * REFERENCE_NOISE);
    evidenceTotal[k] += trust[i] * evidence[i];
    trustTotal[k] += trust[i];
  }

  // Where a neighbourhood cannot tell (a busy photograph), fall back on what
  // the rest of the image says about coloured content, and failing that on
  // the document: a stamp that shows over one coloured box shows over them
  // all. A stroke that replaced coloured content shows over it, in its own
  // way, and counts as such.
  //
  // Paper falls back on "it shows" instead, because there the two mistakes
  // are not alike: undoing a stamp that is hidden under white changes
  // nothing (white stays white), while leaving one that shows keeps the
  // watermark. Only paper, though: the grey parts of a photograph are
  // neutral too, and they follow the pictures around them.
  const darkeningEvidence = evidenceTotal[1];
  const darkeningTrust = trustTotal[1];
  const replacedTrust = (fillReplaced ? replacedWeight : 0) / (REFERENCE_NOISE * REFERENCE_NOISE);
  evidenceTotal[1] += replacedTrust;
  trustTotal[1] += replacedTrust;
  const overContent = trustTotal[1] > 0 ? Math.min(1, Math.max(0, evidenceTotal[1] / trustTotal[1])) : 0;
  // The trust collected grows with the number of pixels, so the bar does too.
  const contentPrior = trustTotal[1] >= OVER_CONTENT_EVIDENCE * pxPerRef * pxPerRef ? overContent : overContentPrior;

  // Pool the evidence over each pixel's surroundings, within its own colour
  // kind, so faint edge pixels follow the strokes they belong to.
  const poolRadius = Math.max(2, Math.round(5 * pxPerRef));
  const pooled: Array<{ num: Float32Array; den: Float32Array }> = [];
  for (let k = 0; k < kinds; k++) {
    const num = new Float32Array(n);
    const den = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (trust[i] <= 0 || kind[i] !== k) continue;
      num[i] = trust[i] * evidence[i];
      den[i] = trust[i];
    }
    pooled.push({ num: boxMean(num, rw, rh, poolRadius), den: boxMean(den, rw, rh, poolRadius) });
  }
  const presence = new Float32Array(n);
  let showing = 0;
  // Pixels that say plainly, on a calm reference, that the stamp shows.
  let plainlyShowing = 0;
  let strengthSum = 0;
  let strengthTrust = 0;
  for (let i = 0; i < n; i++) {
    if (alpha[i] <= 0) continue;
    if (inReplacedStroke[i] === 1) {
      if (replaced[i] === 1 && alpha[i] >= MIN_EVIDENCE_OPACITY) {
        showing++;
        plainlyShowing++;
      }
      continue; // filled in (or left), never divided
    }
    const k = isColour ? kind[i] : 0;
    // A grey pixel with neither paper nor anything grey around it to be
    // judged against is left as it is: there is no telling a darkening from
    // an opaque stroke there, and a stray white patch is worse than a grey.
    const prior = onPaper[i] === 1 ? 1 : k === 0 && reference[0].level[i] <= 0 ? 0 : contentPrior;
    const own = OWN_EVIDENCE_WEIGHT * trust[i];
    const estimate =
      (own * evidence[i] + pooled[k].num[i] + PRIOR_WEIGHT * prior) /
      (own + pooled[k].den[i] + PRIOR_WEIGHT);
    // Usually all or nothing, but a stamp can also show faintly through a
    // translucent panel, so the measured share is kept; only the ends are
    // snapped, where the difference from 0 or 1 is measurement noise.
    presence[i] = estimate < HIDDEN_BELOW ? 0 : estimate > SHOWS_ABOVE ? 1 : estimate;
    if (alpha[i] >= MIN_EVIDENCE_OPACITY) showing += presence[i];
    if (
      evidence[i] >= 0.6 &&
      trust[i] * 4 * REFERENCE_NOISE * REFERENCE_NOISE >= stampDensity[i] * stampDensity[i]
    ) {
      plainlyShowing++;
    }
    if (presence[i] === 1 && trust[i] > 0) {
      strengthSum += trust[i] * evidence[i];
      strengthTrust += trust[i];
    }
  }
  // Is the stamp in this image at all? Enough pixels must say so plainly.
  // Failing that (a full-page photograph has no calm reference anywhere) the
  // image as a whole must: with nothing but the document's say-so, an
  // unstamped cover would get a faint stamp-shaped ghost.
  let shows = showing >= MIN_STAMP_PIXELS;
  if (shows && plainlyShowing < MIN_STAMP_PIXELS) {
    shows = wholeImageStrength(alpha, stampDensity, luma, rw, rh, pxPerRef) > MIN_PRESENT_STRENGTH;
  }
  const strength = strengthTrust > 0 ? strengthSum / strengthTrust : 1;

  // 2. What did the stamp do to colour? A true multiply fades colour along
  //    with brightness; flattened pages usually keep the colour and darken
  //    only the brightness. Measure which (0 = colour kept, 1 = faded) from
  //    the tinted areas where the stamp shows: least squares of the colour
  //    detail on what a full fade would look like, refitted while ignoring
  //    the 30% of pixels that fit worst. Pixels near ink are left out: ink
  //    is far darker than any stamp and the detail filter spreads it around.
  let colourFade = 0;
  let colourEvidence = 0;
  let colourEvidenceNeeded = 0;
  if (isColour && shows) {
    const detailRadius = Math.max(1, Math.round(4 * pxPerRef));
    const ink = new Float32Array(n);
    const shows = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ink[i] = luma[i] / (1 - alpha[i] * presence[i]) < INK_LEVEL ? 1 : 0;
      shows[i] = presence[i] === 1 ? 1 : 0;
    }
    const inkNearby = boxMean(ink, rw, rh, 3 * detailRadius);
    const showsNearby = boxMean(shows, rw, rh, Math.max(1, Math.round(2 * pxPerRef)));
    const fitSet: number[] = [];
    for (let i = 0; i < n; i++) if (showsNearby[i] > NONE && inkNearby[i] <= NONE) fitSet.push(i);
    colourEvidenceNeeded = fitSet.length;
    if (fitSet.length >= MIN_STAMP_PIXELS) {
      const alphaDetail = highPass(alpha, rw, rh, detailRadius);
      const surroundRadius = Math.max(2, Math.round(6 * pxPerRef));
      const signals: Float32Array[] = [];
      const predictors: Float32Array[] = [];
      for (const plane of chroma) {
        const surround = blur(plane, rw, rh, surroundRadius);
        const predictor = new Float32Array(n);
        for (let i = 0; i < n; i++) predictor[i] = -surround[i] * alphaDetail[i];
        signals.push(highPass(plane, rw, rh, detailRadius));
        predictors.push(predictor);
      }
      let trusted = fitSet;
      for (let pass = 0; pass < 4; pass++) {
        let num = 0;
        let den = 0;
        for (const i of trusted) {
          for (let k = 0; k < signals.length; k++) {
            num += signals[k][i] * predictors[k][i];
            den += predictors[k][i] * predictors[k][i];
          }
        }
        colourFade = num / (den + 1e-9);
        colourEvidence = den;
        const residual = new Float32Array(fitSet.length);
        for (let m = 0; m < fitSet.length; m++) {
          const i = fitSet[m];
          let r = 0;
          for (let k = 0; k < signals.length; k++) r += Math.abs(signals[k][i] - colourFade * predictors[k][i]);
          residual[m] = r;
        }
        const cutoff = Float32Array.from(residual).sort()[Math.floor(residual.length * 0.7)];
        trusted = fitSet.filter((_, m) => residual[m] <= cutoff);
      }
      colourFade = Math.min(1, Math.max(0, colourFade));
    }
  }

  return {
    rx0,
    ry0,
    rw,
    rh,
    pxPerRef,
    alpha,
    luma,
    kind,
    presence,
    replaced,
    fill,
    shows,
    strength,
    colourFade,
    colourEvidence,
    // Evidence is the summed squared colour swing the stamp could have
    // caused; under ~1 level per fit pixel the image is effectively neutral.
    colourEvidenceNeeded,
    overContent,
    overContentEvidence: trustTotal[1],
    darkensContent: darkeningTrust > 0 ? Math.min(1, Math.max(0, darkeningEvidence / darkeningTrust)) : 0,
    darkensContentEvidence: darkeningTrust,
    replacedShare: amongColourWeight > 0 ? replacedWeight / amongColourWeight : 0,
    replacedEvidence: amongColourWeight,
  };
}

/**
 * Remove the stamp from one image's pixels, in place, wherever it shows.
 *
 * `toGrid` maps the image's unit square (top-left origin) onto the learning
 * grid. Returns the fitted stamp strength when the image was cleaned, or
 * null when it does not overlap the stamp or the stamp shows nowhere in it.
 */
export function removeStampFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  components: number,
  toGrid: readonly number[],
  model: RasterWatermark,
): number | null {
  const fit = fitStamp(
    pixels,
    width,
    height,
    components,
    toGrid,
    model,
    model.overContent,
    model.replacesContent >= REPLACES_CONTENT_MIN,
  );
  if (!fit || !fit.shows) return null;
  const { rx0, ry0, rw, rh, alpha, luma, kind, presence, replaced, fill, strength } = fit;
  const n = rw * rh;
  const isColour = components >= 3;
  const channels = isColour ? 3 : 1;
  const exponent = Math.min(1.15, Math.max(0.85, strength));
  // This image's own colour measurement when it crosses enough tinted area,
  // otherwise what the document as a whole showed.
  const colourFade = fit.colourEvidence > fit.colourEvidenceNeeded ? fit.colourFade : model.colourFade;

  // Undo the blend where the stamp shows: brightness is divided back up;
  // colour is scaled back by however much of the fade was measured.
  const restored = new Float32Array(n * channels);
  const touched = new Float32Array(n);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      if (replaced[i] === 1) {
        touched[i] = 1; // filled in below, once its surroundings are settled
        continue;
      }
      if (alpha[i] <= 0 || presence[i] <= 0.001) {
        for (let ch = 0; ch < channels; ch++) restored[i * channels + ch] = pixels[q + ch];
        continue;
      }
      touched[i] = presence[i];
      const gain = Math.pow(1 - alpha[i], -exponent * presence[i]);
      const level = luma[i] * gain;
      if (!isColour) {
        restored[i] = Math.min(255, level);
        continue;
      }
      const colourGain = 1 / (1 - colourFade * (1 - 1 / gain));
      for (let ch = 0; ch < 3; ch++) {
        const value = level + (pixels[q + ch] - luma[i]) * colourGain;
        restored[i * 3 + ch] = Math.min(255, Math.max(0, value));
      }
    }
  }

  // Where an opaque stamp replaced coloured content there is nothing to
  // divide: fill it in from its edges inward, each layer taking the average
  // of the neighbours already settled, so the surrounding colours continue
  // across the stroke instead of one flat patch.
  if (isColour) {
    const open = new Uint8Array(n);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) {
      if (replaced[i] === 1) {
        open[i] = 1;
        frontier.push(i);
      }
    }
    for (let layer = 0; layer < MAX_FILL_LAYERS && frontier.length > 0; layer++) {
      const settled: number[] = [];
      const values: number[] = [];
      const waiting: number[] = [];
      for (const i of frontier) {
        const x = i % rw;
        const y = (i - x) / rw;
        const sum = [0, 0, 0];
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= rw || (dx === 0 && dy === 0)) continue;
            const j = yy * rw + xx;
            // Text printed over the stroke is kept, but its black must not
            // bleed into the fill.
            if (open[j] === 1 || (kind[j] === 0 && luma[j] < INK_LEVEL)) continue;
            sum[0] += restored[j * 3];
            sum[1] += restored[j * 3 + 1];
            sum[2] += restored[j * 3 + 2];
            count++;
          }
        }
        if (count === 0) {
          waiting.push(i);
          continue;
        }
        settled.push(i);
        values.push(sum[0] / count, sum[1] / count, sum[2] / count);
      }
      for (let k = 0; k < settled.length; k++) {
        const i = settled[k];
        restored[i * 3] = values[k * 3];
        restored[i * 3 + 1] = values[k * 3 + 1];
        restored[i * 3 + 2] = values[k * 3 + 2];
        open[i] = 0;
      }
      frontier = waiting;
    }
    // Anything still unreached (the heart of a very thick stroke) takes the
    // average colour around it.
    for (const i of frontier) {
      const level = fill.luma[i];
      const red = level + fill.red[i];
      const blue = level + fill.blue[i];
      restored[i * 3] = Math.min(255, Math.max(0, red));
      restored[i * 3 + 1] = Math.min(255, Math.max(0, (level - LUMA_R * red - LUMA_B * blue) / LUMA_G));
      restored[i * 3 + 2] = Math.min(255, Math.max(0, blue));
    }
  }

  // Calm the compression noise the division amplifies, only where the stamp
  // was undone: an edge-preserving average blended in by how much was undone.
  const coverage = blur(boxMean(touched, rw, rh, Math.max(1, Math.round(2 * fit.pxPerRef))), rw, rh, 1);
  const spatialSigma2 = 2 * 3 * 3;
  const rangeSigma2 = 2 * 18 * 18;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      const mix = Math.min(1, coverage[i] * 4);
      if (mix <= 0.001) {
        if (touched[i] > 0) {
          for (let ch = 0; ch < channels; ch++) pixels[q + ch] = Math.round(restored[i * channels + ch]);
        }
        continue;
      }
      let weightSum = 0;
      const sum = [0, 0, 0];
      for (let dy = -2; dy <= 2; dy++) {
        const yy = Math.min(rh - 1, Math.max(0, y + dy));
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(rw - 1, Math.max(0, x + dx));
          const j = (yy * rw + xx) * channels;
          let diff = 0;
          for (let ch = 0; ch < channels; ch++) diff += Math.abs(restored[j + ch] - restored[i * channels + ch]);
          const wgt = Math.exp(-(dx * dx + dy * dy) / spatialSigma2 - (diff * diff) / rangeSigma2);
          for (let ch = 0; ch < channels; ch++) sum[ch] += restored[j + ch] * wgt;
          weightSum += wgt;
        }
      }
      for (let ch = 0; ch < channels; ch++) {
        const smooth = sum[ch] / weightSum;
        pixels[q + ch] = Math.round(restored[i * channels + ch] * (1 - mix) + smooth * mix);
      }
    }
  }

  return Math.round(strength * 100) / 100;
}

/**
 * Clean one image about to be drawn. `ctm` maps the image's unit square to
 * render space (page points × `renderScale`, page origin at 0,0).
 *
 * Returns a replacement image (caller destroys it) plus the cleaned pixels,
 * or null when the image is left as it is.
 */
function cleanDrawnImage(
  image: MupdfImage,
  ctm: MupdfMatrix,
  renderScale: number,
  model: RasterWatermark,
): { replacement: MupdfImage; raster: CleanedRaster } | null {
  // Placement first: most images on a page are nowhere near the stamp, and
  // ruling them out here costs nothing, where decoding one costs its pixels.
  const k = model.scale / renderScale;
  const placed = unitImageBbox(ctm);
  if (
    placed.x1 * k <= model.box[0] || placed.x0 * k >= model.box[2] ||
    placed.y1 * k <= model.box[1] || placed.y0 * k >= model.box[3]
  ) {
    return null;
  }
  // A soft mask is transparency the decoded pixels do not carry (toPixmap
  // leaves it out), and the extracted image is the two combined. Leave such
  // images alone rather than hand back an opaque copy.
  if (imageHasMask(image)) return null;

  const source = image.toPixmap();
  try {
    const type = source.getColorSpace()?.getType();
    const components = source.getNumberOfComponents();
    const width = source.getWidth();
    const height = source.getHeight();
    if (source.getAlpha()) return null;
    if (!((type === "RGB" && components === 3) || (type === "Gray" && components === 1))) return null;
    if (source.getStride() !== width * components) return null;

    // Work on a copy: mupdf caches the decoded pixmap, so editing it in
    // place would leak the change into every later render of this image.
    const pixels = new Uint8Array(source.getPixels());
    const strength = removeStampFromPixels(
      pixels,
      width,
      height,
      components,
      [ctm[0] * k, ctm[1] * k, ctm[2] * k, ctm[3] * k, ctm[4] * k, ctm[5] * k],
      model,
    );
    if (strength === null) return null;

    const colorSpace = source.getColorSpace();
    if (!colorSpace) return null;
    const cleaned = new mupdf.Pixmap(colorSpace, [0, 0, width, height], false);
    let replacement: MupdfImage;
    try {
      cleaned.getPixels().set(pixels);
      replacement = new mupdf.Image(cleaned);
    } finally {
      cleaned.destroy();
    }

    return {
      replacement,
      raster: {
        width,
        height,
        components,
        bbox: [
          placed.x0 / renderScale,
          placed.y0 / renderScale,
          placed.x1 / renderScale,
          placed.y1 / renderScale,
        ],
        pixels,
        strength,
      },
    };
  } finally {
    source.destroy();
  }
}

/**
 * Render the page to a PNG at `scale` with the stamp removed from every
 * image that carries it (and any text stamps dropped, as in
 * `renderPageWithoutWatermarks`). Also returns the cleaned images so the
 * caller can emit them in place of the stamped originals.
 *
 * `cleaned` is empty when the stamp is absent from this page. Returns null
 * on failure so callers can fall back to the standard render.
 */
export function renderPageWithoutRasterWatermark(
  page: AnyPage,
  scale: number,
  model: RasterWatermark,
  textWatermarks: WatermarkSignature[] = [],
): { png: Buffer; cleaned: CleanedRaster[] } | null {
  const cleaned: CleanedRaster[] = [];
  const png = renderPageFiltered(page, scale, {
    watermarks: textWatermarks,
    replaceImage(image, ctm) {
      try {
        const result = cleanDrawnImage(image, ctm, scale, model);
        if (!result) return null;
        cleaned.push(result.raster);
        return result.replacement;
      } catch (err) {
        console.warn(
          "[pdf] raster watermark removal failed for one image, keeping it as is:",
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    },
  });
  return png ? { png, cleaned } : null;
}

/** Encode a cleaned image in the format of the original it replaces. */
export function encodeCleanedRaster(raster: CleanedRaster, format: "png" | "jpeg"): Buffer {
  const colorSpace = raster.components === 1 ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
  const pixmap = new mupdf.Pixmap(colorSpace, [0, 0, raster.width, raster.height], false);
  try {
    pixmap.getPixels().set(raster.pixels);
    return Buffer.from(format === "jpeg" ? pixmap.asJPEG(CLEANED_JPEG_QUALITY, false) : pixmap.asPNG());
  } finally {
    pixmap.destroy();
  }
}

/** Summary of the learned stamp and what it did on one page, for debug output. */
export function describeRasterWatermark(
  model: RasterWatermark,
  cleaned: CleanedRaster[],
): RasterWatermarkDebug {
  const toPoints = (v: number): number => Math.round((v / model.scale) * 100) / 100;
  return {
    bbox: [toPoints(model.box[0]), toPoints(model.box[1]), toPoints(model.box[2]), toPoints(model.box[3])],
    peakOpacity: model.peakOpacity,
    colourFade: model.colourFade,
    overContent: model.overContent,
    replacesContent: model.replacesContent,
    pagesSampled: model.pagesSampled,
    cleanedImageStrengths: cleaned.map((raster) => raster.strength),
  };
}
