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
 * Scope: one large neutral (grey/black) mark at a fixed page position, on
 * documents with enough image-only pages showing blank paper under it.
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

/** Learning needs at least this many image pages. */
const MIN_IMAGE_PAGES = 8;

/** Memory budget for the per-page darkness planes kept while learning. */
const LEARN_BUDGET_BYTES = 64 * 1024 * 1024;

/** Largest learning grid; higher-resolution scans are learned at this size. */
const MAX_LEARN_PIXELS = 1_600_000;

/** Window sizes below are stated in pixels at this resolution. */
const REFERENCE_DPI = 100;

/** Blank paper: mostly at least this bright, with no ink and no colour. */
const PAPER_WHITE_LEVEL = 246;
const INK_LEVEL = 150;
const MAX_PAPER_SATURATION = 16;

/** Learned darkness below this is scanner/JPEG noise, not a mark. */
const NOISE_FLOOR = 2.5;

/** Darkness that counts as part of a mark when outlining it. */
const MARK_LEVEL = 6;

/** Opacity is capped: a darker "mark" is content, and dividing by it explodes. */
const MAX_OPACITY = 0.6;

/** The mark must reach this opacity somewhere to be worth removing. */
const MIN_PEAK_OPACITY = 0.04;

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

/** Below this fitted strength the stamp is treated as absent from an image. */
const MIN_PRESENT_STRENGTH = 0.3;

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
  /** Image pages the stamp was learned from. */
  pagesSampled: number;
}

/** JSON-safe summary recorded in the extraction debug output. */
export interface RasterWatermarkDebug {
  /** Stamp bounding box in PDF points (page top-left origin). */
  bbox: [number, number, number, number];
  peakOpacity: number;
  colourFade: number;
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
  /** Share of the page area covered by image ops. */
  coverage: number;
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
  const device = new mupdf.Device({
    fillImage(image, ctm) {
      const placed = unitImageBbox(ctm);
      const area =
        Math.max(0, Math.min(bounds[2], placed.x1) - Math.max(bounds[0], placed.x0)) *
        Math.max(0, Math.min(bounds[3], placed.y1) - Math.max(bounds[1], placed.y0));
      covered += area;
      if (area > largest) {
        largest = area;
        const placedWidthPt = Math.hypot(ctm[0], ctm[1]);
        dpi = placedWidthPt > 0 ? (image.getWidth() / placedWidthPt) * 72 : 0;
      }
    },
  });
  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  const pageArea = widthPt * heightPt;
  return { coverage: pageArea > 0 ? Math.min(1, covered / pageArea) : 0, dpi, widthPt, heightPt };
}

/** Render only the page's image ops (what this module is able to edit). */
function renderImagesOnly(
  page: AnyPage,
  scale: number,
): { width: number; height: number; rgb: Uint8Array } {
  const bounds = page.getBounds();
  const width = Math.round((bounds[2] - bounds[0]) * scale);
  const height = Math.round((bounds[3] - bounds[1]) * scale);
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
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

/** Marks a darkness sample taken well clear of any ink (see below). */
const CLEAR_SAMPLE = 0x80;
/** Plane value for a pixel that is not blank paper. */
const NOT_PAPER = 0xff;

/**
 * Darkness (255 - brightness) of every pixel that would be blank paper but
 * for a faint overlay, or `NOT_PAPER`.
 *
 * Two grades are recorded. A "clear" sample (flagged with `CLEAR_SAMPLE`)
 * has no ink anywhere near it, so it is free of the ringing and soft edges
 * compression leaves around text. A plain sample only has no ink right next
 * to it: noisier, but available between the lines of a text-heavy page,
 * where clear samples are rare. Blank-paper darkness never exceeds
 * 255 - INK_LEVEL, so it fits under the flag bit.
 */
function blankPaperDarkness(
  rgb: Uint8Array,
  w: number,
  h: number,
  pxPerRef: number,
  /** Per pixel: how many pages gave a sample, and how many of those samples
   *  had colour close by. Updated for this page. */
  tally: { samples: Uint8Array; besideColour: Uint8Array },
): Uint8Array {
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
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!(mostlyWhite[i] > 0.55) || inkBeside[i] > NONE || colourBeside[i] > NONE) {
      out[i] = NOT_PAPER;
      continue;
    }
    if (tally.samples[i] < 255) {
      tally.samples[i]++;
      if (colourAround[i] > NONE) tally.besideColour[i]++;
    }
    const darkness = Math.min(255 - INK_LEVEL, Math.round(255 - gray[i]));
    const clear = inkAround[i] < 0.004 && colourAround[i] <= NONE;
    out[i] = clear ? darkness | CLEAR_SAMPLE : darkness;
  }
  return out;
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

/** Stamps already learned, by PDF content (see `detectRasterWatermark`). */
const learnedStamps = new Map<string, RasterWatermark | null>();
const LEARNED_STAMPS_KEPT = 4;

/**
 * Learn a repeated stamp baked into the document's page images.
 *
 * Samples pages evenly over the whole document (independent of any
 * extraction page range, so partial extractions of the same PDF agree).
 * Returns null when the document has too few image pages or no qualifying
 * mark — never throws.
 *
 * Learning reads up to a hundred pages, so pass `cacheKey` (something that
 * identifies the PDF's content) when the same document may be extracted
 * again — re-extracting two pages for a spread merge must not repeat it.
 */
export function detectRasterWatermark(doc: MupdfDocument, cacheKey?: string): RasterWatermark | null {
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
    model = learnRasterWatermark(doc);
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

function learnRasterWatermark(doc: MupdfDocument): RasterWatermark | null {
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
        info = { coverage: 0, dpi: 0, widthPt: 0, heightPt: 0 };
      }
      measured.set(index, info);
    }
    return info.coverage >= IMAGE_PAGE_MIN_COVERAGE && info.dpi > 0;
  };
  if (!spreadPageIndices(totalPages, PRECHECK_PAGES).some(isImagePage)) return null;

  // A stamp sits at one position on one page size, so learn from the pages
  // of the most common size. Covers and inserts are often a different size
  // and must not decide (or sink) the grid.
  const bySize = new Map<string, number[]>();
  for (const index of spreadPageIndices(totalPages, MAX_CANDIDATE_PAGES).filter(isImagePage)) {
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

  // Learn on the scans' own pixel grid where the budget allows: any other
  // grid resamples the stamp and blurs its edges.
  const dpis = Float32Array.from(imagePages.map((i) => measured.get(i)?.dpi ?? 0));
  const sizeOf = measured.get(imagePages[0]) as PageImageCoverage;
  const pageArea = sizeOf.widthPt * sizeOf.heightPt;
  const maxScale = Math.sqrt(MAX_LEARN_PIXELS / Math.max(1, pageArea));
  const scale = Math.min(maxScale, Math.max(0.5, medianOf(dpis) / 72));
  const pxPerRef = (scale * 72) / REFERENCE_DPI;

  const pagePixels = Math.round(pageArea * scale * scale);
  const maxPlanes = Math.max(MIN_IMAGE_PAGES, Math.floor(LEARN_BUDGET_BYTES / Math.max(1, pagePixels)));
  const learnPages = imagePages.length <= maxPlanes
    ? imagePages
    : spreadPageIndices(imagePages.length, maxPlanes).map((i) => imagePages[i]);

  let width = 0;
  let height = 0;
  const planes: Uint8Array[] = [];
  let tally = { samples: new Uint8Array(0), besideColour: new Uint8Array(0) };
  for (const index of learnPages) {
    let rendered: { width: number; height: number; rgb: Uint8Array };
    try {
      rendered = renderImagesOnly(doc.loadPage(index), scale);
    } catch {
      continue; // one broken page must not disable detection
    }
    if (planes.length === 0) {
      width = rendered.width;
      height = rendered.height;
      tally = { samples: new Uint8Array(width * height), besideColour: new Uint8Array(width * height) };
    }
    // Sizes are grouped to half a point; a page that still rounds to a
    // different pixel grid would put the stamp a pixel off.
    if (rendered.width !== width || rendered.height !== height) continue;
    planes.push(blankPaperDarkness(rendered.rgb, width, height, pxPerRef, tally));
  }
  if (planes.length < MIN_IMAGE_PAGES) return null;

  // Median darkness over the pages where each pixel is blank paper. Clear
  // samples decide wherever there are enough of them; elsewhere every sample
  // is used, taking a lower quantile because what contaminates the noisier
  // ones (soft text edges) only ever makes a pixel darker.
  const minObservations = Math.max(4, Math.min(8, Math.floor(planes.length / 3)));
  const level = new Float32Array(width * height).fill(-1);
  const clearSamples = new Uint8Array(planes.length);
  const allSamples = new Uint8Array(planes.length);
  for (let p = 0; p < width * height; p++) {
    let clearCount = 0;
    let allCount = 0;
    for (let k = 0; k < planes.length; k++) {
      const v = planes[k][p];
      if (v === NOT_PAPER) continue;
      allSamples[allCount++] = v & ~CLEAR_SAMPLE;
      if (v & CLEAR_SAMPLE) clearSamples[clearCount++] = v & ~CLEAR_SAMPLE;
    }
    if (clearCount >= minObservations) {
      const sorted = clearSamples.subarray(0, clearCount).sort();
      level[p] = clearCount % 2 === 1
        ? sorted[clearCount >> 1]
        : (sorted[clearCount / 2 - 1] + sorted[clearCount / 2]) / 2;
    } else if (allCount >= minObservations) {
      level[p] = allSamples.subarray(0, allCount).sort()[Math.floor(allCount * 0.4)];
    }
  }

  // Scanned paper is rarely pure white. Most blank-paper pixels carry no
  // mark, so their median is the paper itself; a mark is what is darker than
  // that, and its opacity is the share of the paper's brightness it removed.
  const paperSamples: number[] = [];
  for (let p = 0; p < width * height; p += 7) if (level[p] >= 0) paperSamples.push(level[p]);
  if (paperSamples.length === 0) return null;
  const paperDarkness = medianOf(Float32Array.from(paperSamples));
  const paperLevel = 255 - paperDarkness;
  const darkness = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const above = level[p] - paperDarkness;
    if (above >= NOISE_FLOOR) darkness[p] = above;
  }

  // The heaviest mark that looks like a stamp. Heavier page furniture — a
  // footer rule, a page frame, a table grid — is passed over rather than
  // taken for the watermark or allowed to hide a fainter real one.
  const { candidates, label } = findMarks(darkness, width, height, Math.max(2, Math.round(15 * pxPerRef)));
  const minSide = Math.max(8, Math.round(MIN_MARK_SIDE * pxPerRef));
  const minRun = Math.max(12, Math.round(STRAIGHT_RUN_SHARE_OF_PAGE * Math.min(width, height)));
  let chosen: { box: [number, number, number, number]; opacity: Float32Array; peak: number } | null = null;
  for (const mark of candidates.slice(0, MAX_MARKS_CONSIDERED)) {
    const [bx0, by0, bx1, by1] = mark.box;
    const boxW = bx1 - bx0;
    const boxH = by1 - by0;
    if (Math.min(boxW, boxH) < minSide) continue;
    if (Math.hypot(boxW, boxH) / Math.hypot(width, height) < MIN_DIAGONAL_RATIO) continue;
    if (straightRunShare(darkness, label, mark, width, minRun) > MAX_STRAIGHT_RUN_SHARE) continue;

    const opacity = new Float32Array(boxW * boxH);
    let peak = 0;
    let samples = 0;
    let besideColour = 0;
    for (let y = 0; y < boxH; y++) {
      for (let x = 0; x < boxW; x++) {
        const p = (y + by0) * width + x + bx0;
        if (label[p] !== mark.label) continue; // unrelated faint marks inside the box
        const a = Math.min(MAX_OPACITY, darkness[p] / paperLevel);
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
    chosen = { box: mark.box, opacity, peak };
    break;
  }
  if (!chosen) return null;

  // What the stamp did to colour, pooled over a spread of pages so images
  // that cross little tinted area can borrow the document's answer. With no
  // tinted area anywhere the value is never consulted where it matters; a
  // plain multiply is the textbook blend, so it is the fallback.
  const draft = { scale, box: chosen.box, opacity: chosen.opacity };
  let fadeSum = 0;
  let fadeEvidence = 0;
  const colourPages = spreadPageIndices(learnPages.length, COLOUR_FIT_PAGES).map((i) => learnPages[i]);
  for (const index of colourPages) {
    try {
      const rendered = renderImagesOnly(doc.loadPage(index), scale);
      if (rendered.width !== width || rendered.height !== height) continue;
      const fit = fitStamp(rendered.rgb, width, height, 3, [width, 0, 0, height, 0, 0], draft);
      if (!fit || fit.colourEvidence <= fit.colourEvidenceNeeded) continue;
      fadeSum += fit.colourFade * fit.colourEvidence;
      fadeEvidence += fit.colourEvidence;
    } catch {
      continue;
    }
  }
  const colourFade = fadeEvidence > 0 ? fadeSum / fadeEvidence : 1;

  return {
    ...draft,
    peakOpacity: Math.round(chosen.peak * 1000) / 1000,
    colourFade: Math.round(colourFade * 100) / 100,
    pagesSampled: planes.length,
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
  /** Stamp opacity per pixel of the rectangle (0 where the stamp is not). */
  alpha: Float32Array;
  /** Brightness per pixel of the rectangle, as seen. */
  luma: Float32Array;
  /** 1 on and just around stamp pixels. */
  nearStamp: Float32Array;
  /** How strongly the stamp is present (1 = as learned). */
  strength: number;
  /** Measured colour fade and how much evidence there was for it. */
  colourFade: number;
  colourEvidence: number;
  /** Evidence needed before `colourFade` can be trusted. */
  colourEvidenceNeeded: number;
}

/**
 * Measure the stamp in one image: where it falls, whether it is present, and
 * what it did to colour. `toGrid` maps the image's unit square (top-left
 * origin) onto the learning grid, so the stamp is evaluated at each image
 * pixel's own position. Returns null when the image does not overlap the
 * stamp or the stamp is not present in it.
 */
function fitStamp(
  pixels: Uint8Array,
  width: number,
  height: number,
  components: number,
  toGrid: readonly number[],
  model: Pick<RasterWatermark, "scale" | "box" | "opacity">,
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

  // Image pixels per reference pixel, for sizing the filter windows.
  const pxPerGrid = Math.sqrt((width * height) / Math.abs(det));
  const pxPerRef = (pxPerGrid * model.scale * 72) / REFERENCE_DPI;

  const n = rw * rh;
  const alpha = new Float32Array(n);
  const stampDensity = new Float32Array(n);
  const inStamp = new Float32Array(n);
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
      inStamp[i] = 1;
      stampPixels++;
    }
  }
  if (stampPixels < MIN_STAMP_PIXELS) return null;

  const detailRadius = Math.max(1, Math.round(4 * pxPerRef));
  const stampDetail = highPass(stampDensity, rw, rh, detailRadius);
  const nearStamp = boxMean(inStamp, rw, rh, Math.max(1, Math.round(2 * pxPerRef)));
  const fitPixels: number[] = [];
  for (let i = 0; i < n; i++) if (nearStamp[i] > NONE) fitPixels.push(i);

  // Brightness (luma) and the two colour-difference signals of the region.
  const isColour = components >= 3;
  const luma = new Float32Array(n);
  const density = new Float32Array(n);
  const chroma: Float32Array[] = isColour ? [new Float32Array(n), new Float32Array(n)] : [];
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      const level = isColour
        ? LUMA_R * pixels[q] + LUMA_G * pixels[q + 1] + LUMA_B * pixels[q + 2]
        : pixels[q];
      luma[i] = level;
      density[i] = -Math.log(Math.max(8, level) / 255);
      if (isColour) {
        chroma[0][i] = pixels[q] - level;
        chroma[1][i] = pixels[q + 2] - level;
      }
    }
  }
  const lumaDetail = highPass(density, rw, rh, detailRadius);

  // Fit only where the page is calm. Ink is far darker than any stamp, and
  // the detail filter spreads its influence over its whole window, so stamp
  // pixels near text would outvote the clean ones. "Ink" is judged on the
  // brightness the pixel would have with the stamp undone.
  const ink = new Float32Array(n);
  for (let i = 0; i < n; i++) ink[i] = luma[i] / (1 - alpha[i]) < INK_LEVEL ? 1 : 0;
  const inkNearby = boxMean(ink, rw, rh, 3 * detailRadius);
  const calm = fitPixels.filter((i) => inkNearby[i] <= NONE);
  const fitSet = calm.length >= Math.max(MIN_STAMP_PIXELS, fitPixels.length * 0.1) ? calm : fitPixels;

  // 1. Is the stamp here, and how strongly? Fitted on brightness, where the
  //    blend is a plain multiply whatever the colour underneath. The slope
  //    minimising absolute error is the weighted median of the per-pixel
  //    ratios, which holds up until half the evidence is content, not stamp.
  const ratios: Array<[number, number]> = [];
  let totalWeight = 0;
  for (const i of fitSet) {
    const weight = Math.abs(stampDetail[i]);
    if (weight < 0.01) continue;
    ratios.push([lumaDetail[i] / stampDetail[i], weight]);
    totalWeight += weight;
  }
  if (ratios.length < MIN_STAMP_PIXELS) return null;
  ratios.sort((p, q) => p[0] - q[0]);
  let strength = 0;
  let running = 0;
  for (const [ratio, weight] of ratios) {
    running += weight;
    if (running >= totalWeight / 2) {
      strength = ratio;
      break;
    }
  }
  if (!(strength > MIN_PRESENT_STRENGTH)) return null;

  // 2. What did the stamp do to colour? A true multiply fades colour along
  //    with brightness; flattened pages usually keep the colour and darken
  //    only the brightness. Measure which (0 = colour kept, 1 = faded) from
  //    the tinted areas the stamp crosses: least squares of the colour
  //    detail on what a full fade would look like, refitted while ignoring
  //    the 30% of pixels that fit worst.
  let colourFade = 0;
  let colourEvidence = 0;
  if (isColour) {
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

  return {
    rx0,
    ry0,
    rw,
    rh,
    alpha,
    luma,
    nearStamp,
    strength,
    colourFade,
    colourEvidence,
    // Evidence is the summed squared colour swing the stamp could have
    // caused; under ~1 level per fit pixel the image is effectively neutral.
    colourEvidenceNeeded: fitSet.length,
  };
}

/**
 * Remove the stamp from one image's pixels, in place.
 *
 * `toGrid` maps the image's unit square (top-left origin) onto the learning
 * grid. Returns the fitted stamp strength when the image was cleaned, or
 * null when it does not overlap the stamp or the stamp is not present in it.
 */
export function removeStampFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  components: number,
  toGrid: readonly number[],
  model: RasterWatermark,
): number | null {
  const fit = fitStamp(pixels, width, height, components, toGrid, model);
  if (!fit) return null;
  const { rx0, ry0, rw, rh, alpha, luma, nearStamp, strength } = fit;
  const n = rw * rh;
  const isColour = components >= 3;
  const channels = isColour ? 3 : 1;
  const exponent = Math.min(1.15, strength);
  // This image's own colour measurement when it crosses enough tinted area,
  // otherwise what the document as a whole showed.
  const colourFade = fit.colourEvidence > fit.colourEvidenceNeeded ? fit.colourFade : model.colourFade;

  // Undo the blend: brightness is divided back up; colour is scaled back by
  // however much of the fade was measured.
  const restored = new Float32Array(n * channels);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      if (alpha[i] <= 0) {
        for (let ch = 0; ch < channels; ch++) restored[i * channels + ch] = pixels[q + ch];
        continue;
      }
      const gain = Math.pow(1 - alpha[i], -exponent);
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

  // Calm the compression noise the division amplifies, only where the stamp
  // was: an edge-preserving average blended in by stamp coverage.
  const coverage = blur(nearStamp.map((v) => (v > NONE ? 1 : 0)), rw, rh, 1);
  const spatialSigma2 = 2 * 3 * 3;
  const rangeSigma2 = 2 * 18 * 18;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const q = ((ry0 + y) * width + rx0 + x) * components;
      const mix = coverage[i];
      if (mix <= 0.001) {
        if (alpha[i] > 0) {
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
    pagesSampled: model.pagesSampled,
    cleanedImageStrengths: cleaned.map((raster) => raster.strength),
  };
}
