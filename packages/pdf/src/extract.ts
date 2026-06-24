/**
 * PDF Extraction Library
 *
 * Extracts pages, text, and images from PDF files using mupdf.
 */

import { createHash } from "crypto";
import { PNG } from "pngjs";
import mupdf, {
  type Document as MupdfDocument,
  type PDFDocument,
  type PDFPage,
  type PDFObject,
  type Pixmap,
} from "mupdf";
import { cropPng, decodePng, stitchPngsHorizontally } from "./png-utils.js";
import { extractTextFromStructuredText } from "./fm-sinhala.js";
import type { RenderMethodValue } from "@adt/types";
import { renderSvgToPng } from "./svg-render.js";
import {
  parsePageParagraphs,
  parsePageParagraphsSpread,
  type AsHtmlParagraph,
  type ImageBounds,
  type PageGeometry,
} from "./positioned-text.js";
import {
  recordPageStream,
  type StreamOp,
  type ImageStreamOp,
  type PathStreamOp,
  type TextStreamOp,
  type BBox as StreamBBox,
  type ClipPath,
  type PathCommand,
} from "./page-stream-recorder.js";
import type { DrawItem, PositionedTextOutput } from "@adt/types";
import { classifyFontCategoryByName } from "@adt/types";

// ============================================================================
// Types
// ============================================================================

export interface ExtractInput {
  /** PDF file contents as a Buffer */
  pdfBuffer: Buffer;
  /** Page range to extract (1-indexed, inclusive) */
  startPage?: number;
  endPage?: number;
  /** When true, merge pairs of pages as spreads (page 1 = cover, 2+3, 4+5, etc.) */
  spreadMode?: boolean;
  /** When true, include text shapes in vector grouping to produce raster crops of vectors with text overlays. Defaults to true. */
  vectorTextGrouping?: boolean;
  /**
   * When true, run the metric-based positioned-text spacing cleanup
   * (`cleanParagraphSpacing`) on extracted paragraphs. The pass strips
   * letter-tracking artefacts ("V O L C A N O E S" → "VOLCANOES") that only
   * matter for fixed-layout rendering — reflowable text comes from a
   * separate path. Default false.
   */
  fixedLayout?: boolean;
}

export interface ExtractedPage {
  pageId: string;
  pageNumber: number;
  text: string;
  pageImage: ExtractedImage;
  images: ExtractedImage[];
  /**
   * Positioned text paragraphs and viewport dimensions, extracted from the
   * PDF's structured text layer. Always populated so fixed-layout rendering
   * has the data available regardless of when the strategy is configured.
   */
  positionedText: PositionedTextOutput;
  /** Debug info about figure grouping and render decisions */
  extractionDebug?: ExtractionDebugOutput;
  /**
   * Per-page serif/sans character tally from the structured-text layer
   * (weighted by character so body text dominates). The pipeline aggregates
   * these across pages to pick a book-level reflowable base font. Transient:
   * not persisted per page.
   */
  fontStats?: { serifChars: number; sansChars: number };
}

export type ImageFormat = "png" | "jpeg";

export type RenderMethod = RenderMethodValue;

export interface ExtractedImage {
  imageId: string;
  pageId: string;
  buffer: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
  hash: string;
  /** How this image was produced during extraction */
  renderMethod?: RenderMethod;
  /**
   * Placement on the page in PDF points (top-left origin). Populated for
   * raster images that can be matched to a placement in the PDF's structured
   * text. Undefined for vector figures and when no match is found.
   */
  bounds?: { x: number; y: number; width: number; height: number };
  /**
   * Zero-based draw order from the PDF's structured-text walker, shared with
   * text paragraphs on the same page so fixed-layout rendering can restore
   * z-stacking. Later items draw on top. Undefined for vector figures
   * (which aren't visible to the walker).
   */
  drawOrder?: number;
  /**
   * Position of this image in the PDF content stream (painter's algorithm).
   * Used by fixed-layout rendering to emit items in true draw order — later
   * seqno renders on top. Transient: not persisted to the images table.
   *   - Raster images: assigned by matching mupdf Device callbacks
   *     (`fillImage` / `fillImageMask`) to extracted XObjects by native
   *     dimensions, in stream order.
   *   - Vector figures: assigned to the minimum seqno of the recorder
   *     path ops whose geometry bbox matches one of this figure's
   *     constituent shape bboxes (see `shapeGeomBoxes`).
   */
  streamSeqno?: number;
  /**
   * Geometry bboxes of this vector figure's constituent SVG shapes, in the
   * same coordinate space as recorder ops (page coords + spread xOffset).
   * `stampFigureSeqnosFromOps` matches recorder path ops to a figure by
   * exact geometry identity against these, not aggregate containment.
   * Transient: vector figures only; not persisted.
   */
  shapeGeomBoxes?: BBox[];
  /**
   * SVG path `d` attribute representing the active PDF clip applied to this
   * image at draw time, in absolute viewport coordinates (PDF points,
   * top-left origin — same space as `bounds`). Set only when the active
   * clip meaningfully reduces the visible area of the image (≤95% overlap
   * with the image's CTM bounds). The renderer translates these coords to
   * the image's local origin when emitting `<clipPath>` markup.
   */
  clipPath?: string;
  /**
   * CSS `mix-blend-mode` value (e.g. "multiply") when the image was drawn
   * under a non-Normal PDF blend mode at composite time. Common in
   * watercolor storybooks: white backgrounds drawn under `/Multiply`
   * effectively become transparent. Undefined when no special blending
   * applies.
   */
  blendMode?: string;
  /**
   * Composed opacity (0..1) when the image's draw-time alpha or any
   * enclosing transparency-group alpha is < 1. Undefined for fully opaque.
   */
  opacity?: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  format?: string;
  encryption?: string;
}

export interface ExtractResult {
  pages: ExtractedPage[];
  pdfMetadata: PdfMetadata;
  totalPagesInPdf: number;
}

export interface ExtractStreamResult {
  pdfMetadata: PdfMetadata;
  totalPagesInPdf: number;
  pages: AsyncGenerator<ExtractedPage, void, unknown>;
}

export interface ExtractProgress {
  page: number;
  totalPages: number;
}

/** Debug info for a single shape in a group */
export interface ShapeDebugInfo {
  type: "vector" | "image" | "text";
  bbox: [number, number, number, number];
  textLength?: number;
}

/** Debug info for a figure group extraction decision */
export interface GroupDebugInfo {
  imageId: string;
  groupIndex: number;
  shapeCount: number;
  shapes: ShapeDebugInfo[];
  groupBbox: [number, number, number, number];
  hasImages: boolean;
  hasText: boolean;
  hasNonText: boolean;
  renderMethod: RenderMethod;
  renderReason: string;
}

/** Full extraction debug output for a page */
export interface ExtractionDebugOutput {
  pageId: string;
  totalShapes: number;
  totalTextShapes: number;
  totalVectorShapes: number;
  totalImageShapes: number;
  backgroundsFiltered: number;
  groupsBeforeMerge: number;
  groupsAfterMerge: number;
  textOnlyGroupsSkipped: number;
  tooSmallGroupsSkipped: number;
  groups: GroupDebugInfo[];
}

// ============================================================================
// Main extraction function
// ============================================================================

/**
 * Extract pages and images from a PDF.
 *
 * @param input - PDF buffer and page range options
 * @param onProgress - Optional progress callback
 * @returns Extracted pages with images and PDF metadata
 */
export async function extractPdf(
  input: ExtractInput,
  onProgress?: (progress: ExtractProgress) => void
): Promise<ExtractResult> {
  const { pdfBuffer, startPage = 1, endPage, spreadMode = false, vectorTextGrouping = true, fixedLayout = false } = input;
  validatePageRange(startPage, endPage);

  // Open PDF (suppressing mupdf stderr spam)
  const doc = openPdfFromBuffer(pdfBuffer);

  // Extract PDF metadata
  const pdfMetadata = extractPdfMetadata(doc);

  // Determine page range
  const totalPagesInPdf = doc.countPages();
  const start = startPage - 1; // Convert to 0-indexed
  const end = Math.min(endPage ?? totalPagesInPdf, totalPagesInPdf);

  const pages: ExtractedPage[] = [];

  if (spreadMode) {
    // Build logical page groups: page 1 = cover (standalone),
    // then pairs 2+3, 4+5, etc. Only pair pages that are both in range.
    const logicalGroups = computeSpreadGroups(start, end);
    const totalLogical = logicalGroups.length;

    for (let g = 0; g < totalLogical; g++) {
      const group = logicalGroups[g];
      const page =
        group.length === 2
          ? await extractSpreadPage(doc, group[0], group[1], vectorTextGrouping, fixedLayout)
          : await extractPage(doc, group[0], vectorTextGrouping, fixedLayout);
      pages.push(page);

      onProgress?.({ page: g + 1, totalPages: totalLogical });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } else {
    const rangeSize = end - start;
    for (let i = start; i < end; i++) {
      const page = await extractPage(doc, i, vectorTextGrouping, fixedLayout);
      pages.push(page);

      onProgress?.({ page: i - start + 1, totalPages: rangeSize });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    pages,
    pdfMetadata,
    totalPagesInPdf,
  };
}

/**
 * Streaming variant of extractPdf — yields pages one at a time via an async
 * generator so the caller can persist each page to disk and release it from
 * memory before the next page is extracted. Peak memory drops from O(all
 * pages) to ~O(1 page).
 */
export function extractPdfStream(
  input: ExtractInput,
  onProgress?: (progress: ExtractProgress) => void
): ExtractStreamResult {
  const { pdfBuffer, startPage = 1, endPage, spreadMode = false, vectorTextGrouping = true, fixedLayout = false } = input;
  validatePageRange(startPage, endPage);

  const doc = openPdfFromBuffer(pdfBuffer);
  const pdfMetadata = extractPdfMetadata(doc);
  const totalPagesInPdf = doc.countPages();

  const start = startPage - 1;
  const end = Math.min(endPage ?? totalPagesInPdf, totalPagesInPdf);

  async function* generatePages(): AsyncGenerator<ExtractedPage, void, unknown> {
    try {
      if (spreadMode) {
        const logicalGroups = computeSpreadGroups(start, end);
        const totalLogical = logicalGroups.length;

        for (let g = 0; g < totalLogical; g++) {
          const group = logicalGroups[g];
          const page =
            group.length === 2
              ? await extractSpreadPage(doc, group[0], group[1], vectorTextGrouping, fixedLayout)
              : await extractPage(doc, group[0], vectorTextGrouping, fixedLayout);

          onProgress?.({ page: g + 1, totalPages: totalLogical });
          yield page;
          // Yield to the macrotask queue so SSE progress events can flush
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } else {
        const rangeSize = end - start;
        for (let i = start; i < end; i++) {
          const page = await extractPage(doc, i, vectorTextGrouping, fixedLayout);

          onProgress?.({ page: i - start + 1, totalPages: rangeSize });
          yield page;
          // Yield to the macrotask queue so SSE progress events can flush
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      doc.destroy();
    }
  }

  return {
    pdfMetadata,
    totalPagesInPdf,
    pages: generatePages(),
  };
}

/**
 * Compute spread page groups from a 0-indexed page range.
 * The first selected page is always standalone, then subsequent pages pair
 * sequentially: start, (start+1,start+2), (start+3,start+4), etc.
 * Returns arrays of 0-indexed page indices (1 or 2 elements each).
 */
function computeSpreadGroups(start: number, end: number): number[][] {
  const groups: number[][] = [];

  let i = start;
  let first = true;
  while (i < end) {
    if (first) {
      groups.push([i]);
      i++;
      first = false;
      continue;
    }

    if (i + 1 < end) {
      groups.push([i, i + 1]);
      i += 2;
    } else {
      groups.push([i]);
      i++;
    }
  }

  return groups;
}

function validatePageRange(startPage: number, endPage?: number): void {
  if (!Number.isFinite(startPage) || !Number.isInteger(startPage) || startPage < 1) {
    throw new RangeError("startPage must be an integer >= 1");
  }

  if (endPage !== undefined && (!Number.isFinite(endPage) || !Number.isInteger(endPage) || endPage < 1)) {
    throw new RangeError("endPage must be an integer >= 1");
  }

  if (endPage !== undefined && endPage < startPage) {
    throw new RangeError("endPage must be greater than or equal to startPage");
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/**
 * Tally non-whitespace characters by serif vs. sans over the structured-text
 * layer. Classification prefers the font NAME (e.g. HelveticaNeue / MyriadPro
 * → sans) because mupdf's `font.isSerif()` is unreliable for embedded subset
 * fonts — it misflags common sans faces as serif — and only falls back to
 * `isSerif()` when the name carries no signal. Cheap: one walk of an already-
 * built StructuredText. The pipeline aggregates these across pages to choose a
 * book-level reflowable base font (body text dominates by character count).
 */
function tallyFontCategories(
  stext: ReturnType<AnyPage["toStructuredText"]>
): { serifChars: number; sansChars: number } {
  let serifChars = 0;
  let sansChars = 0;
  const cache = new Map<string, "serif" | "sans">();
  stext.walk({
    onChar(c, _origin, font) {
      if (!c || /\s/.test(c)) return;
      const name = font?.getName?.() ?? "";
      let cat = cache.get(name);
      if (!cat) {
        cat = classifyFontCategoryByName(name) ?? (font?.isSerif?.() ? "serif" : "sans");
        cache.set(name, cat);
      }
      if (cat === "serif") serifChars++;
      else sansChars++;
    },
  });
  return { serifChars, sansChars };
}

/** Read width and height from a JPEG buffer by finding the SOF0/SOF2 marker. */
function jpegDimensions(buf: Buffer): { width: number; height: number } {
  let i = 2; // skip SOI (0xFFD8)
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0 };
}

function pngDimensions(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Force a pixmap to DeviceRGB so encoders/browsers can render it. RGB and
 * Gray pass through unchanged; CMYK, Lab, ICCBased-non-RGB, etc. convert. */
function normalizeToDisplayableRgb(pixmap: Pixmap): Pixmap {
  const type = pixmap.getColorSpace()?.getType();
  if (type === "RGB" || type === "Gray") return pixmap;
  return pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB);
}

/**
 * Classify an image XObject's colorspace from its PDF dictionary alone — no
 * `loadImage`/decode. `displayable` means the raw image bytes (for a JPEG)
 * are already in a form a browser can render directly (RGB or Gray);
 * `needs-convert` means the image must be decoded and converted to RGB
 * (CMYK, Lab, ICCBased-non-RGB, Separation, DeviceN, Indexed, …) or we
 * couldn't prove it's safe.
 *
 * This is the cheap pre-check that lets the common RGB/Gray JPEG case skip
 * `doc.loadImage()` entirely. It is deliberately conservative: anything not
 * unambiguously RGB/Gray returns `needs-convert`, so the (correct, slower)
 * decode path still handles every case #442 added — we never route a
 * non-displayable image to the raw fast path.
 */
function classifyImageColorSpace(resolved: PDFObject): "displayable" | "needs-convert" {
  try {
    const cs = resolved.get("ColorSpace");
    if (cs.isNull()) return "needs-convert";

    if (cs.isName()) {
      switch (cs.asName()) {
        case "DeviceRGB":
        case "CalRGB":
        case "DeviceGray":
        case "CalGray":
          return "displayable";
        default:
          return "needs-convert"; // DeviceCMYK, Pattern, named refs, …
      }
    }

    if (cs.isArray() && cs.length > 0) {
      const family = cs.get(0).asName();
      if (family === "CalRGB" || family === "CalGray") return "displayable";
      if (family === "ICCBased") {
        const n = cs.get(1).resolve().get("N").asNumber();
        // N=1 (Gray) and N=3 (RGB) are browser-displayable; N=4 is CMYK.
        return n === 1 || n === 3 ? "displayable" : "needs-convert";
      }
      // Lab, Separation, DeviceN, Indexed, Pattern, … all need conversion.
      return "needs-convert";
    }

    return "needs-convert";
  } catch {
    // Any malformed/unexpected colorspace structure → take the safe path.
    return "needs-convert";
  }
}

/** Read the /Matte array off an SMask dictionary, expressed as 8-bit RGB.
 * Only RGB (3) and Gray (1) source colorspaces are handled; for anything
 * else (e.g. CMYK) we conservatively skip un-matting. */
function readSoftMaskMatte(
  smaskObj: PDFObject,
  srcType: string | undefined
): [number, number, number] | undefined {
  if (smaskObj.isNull()) return undefined;
  const smaskDict = smaskObj.isIndirect() ? smaskObj.resolve() : smaskObj;
  const matte = smaskDict.get("Matte");
  if (matte.isNull() || !matte.isArray()) return undefined;

  const toByte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)));

  if (matte.length === 3 && srcType === "RGB") {
    return [
      toByte(matte.get(0).asNumber()),
      toByte(matte.get(1).asNumber()),
      toByte(matte.get(2).asNumber()),
    ];
  }
  if (matte.length === 1 && srcType === "Gray") {
    const g = toByte(matte.get(0).asNumber());
    return [g, g, g];
  }
  return undefined;
}

/**
 * Combine a color pixmap with a grayscale alpha mask (from an image's SMask)
 * into an RGBA PNG. PDF SMasks provide the transparency that
 * `mupdf.Pixmap.toPixmap()` doesn't composite by itself, so without this step
 * transparent regions come out as opaque black.
 *
 * If color and mask dimensions differ we fall back to sampling the mask at
 * the matching position (nearest-neighbour), which handles the common case
 * of a lower-resolution SMask.
 *
 * If `matteRgb` is provided, the base RGB has been pre-blended with that
 * matte color and is un-matted (`c = matte + (c' - matte) * 255 / a`) so
 * semi-transparent edges don't show colored halos.
 */
function compositeColorAndMask(
  color: Pixmap,
  mask: Pixmap,
  matteRgb?: readonly [number, number, number]
): Buffer {
  // The pixel-reading loop below assumes RGB or Gray byte layout. Convert
  // anything else (CMYK, Lab, ICCBased-non-RGB, …) to DeviceRGB up front,
  // otherwise we'd read CMY bytes as RGB and silently drop K.
  const csType = color.getColorSpace()?.getType();
  const rgb =
    csType === "RGB" || csType === "Gray"
      ? color
      : color.convertToColorSpace(mupdf.ColorSpace.DeviceRGB);

  const width = rgb.getWidth();
  const height = rgb.getHeight();
  const colorComponents = rgb.getNumberOfComponents();
  const colorAlpha = rgb.getAlpha();
  const colorStride = colorComponents + (colorAlpha ? 1 : 0);
  const colorPixels = rgb.getPixels();

  const mWidth = mask.getWidth();
  const mHeight = mask.getHeight();
  const maskComponents = mask.getNumberOfComponents();
  const maskAlpha = mask.getAlpha();
  const maskStride = maskComponents + (maskAlpha ? 1 : 0);
  const maskPixels = mask.getPixels();

  const mr = matteRgb ? matteRgb[0] : 0;
  const mg = matteRgb ? matteRgb[1] : 0;
  const mb = matteRgb ? matteRgb[2] : 0;

  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const my = mHeight === height ? y : Math.min(mHeight - 1, Math.round((y * mHeight) / height));
    for (let x = 0; x < width; x++) {
      const mx = mWidth === width ? x : Math.min(mWidth - 1, Math.round((x * mWidth) / width));
      const srcIdx = (y * width + x) * colorStride;
      const maskIdx = (my * mWidth + mx) * maskStride;
      const dstIdx = (y * width + x) * 4;
      let r: number, g: number, b: number;
      // Color channels: grayscale → replicate, RGB → copy direct.
      if (colorComponents === 1) {
        const v = colorPixels[srcIdx];
        r = v; g = v; b = v;
      } else {
        r = colorPixels[srcIdx];
        g = colorPixels[srcIdx + 1];
        b = colorPixels[srcIdx + 2];
      }
      // Alpha from mask: mupdf SMask pixmaps are typically grayscale with the
      // value itself representing alpha (higher = more opaque).
      const a = maskPixels[maskIdx];
      if (matteRgb && a > 0 && a < 255) {
        r = Math.max(0, Math.min(255, Math.round(mr + ((r - mr) * 255) / a)));
        g = Math.max(0, Math.min(255, Math.round(mg + ((g - mg) * 255) / a)));
        b = Math.max(0, Math.min(255, Math.round(mb + ((b - mb) * 255) / a)));
      }
      png.data[dstIdx] = r;
      png.data[dstIdx + 1] = g;
      png.data[dstIdx + 2] = b;
      png.data[dstIdx + 3] = a;
    }
  }
  // Free the temporary conversion pixmap (the caller owns and destroys the
  // original `color`).
  if (rgb !== color) rgb.destroy();
  return PNG.sync.write(png);
}

/** Returns true if every pixel in the RGBA PNG is fully transparent (alpha === 0). */
function isFullyTransparent(pngBuffer: Buffer): boolean {
  const { data } = decodePng(pngBuffer);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

/** Crop a PNG to the tight bounding box of non-transparent pixels. Returns original if no crop needed. */
function autoCropPng(pngBuffer: Buffer): Buffer {
  const { data, width, height } = decodePng(pngBuffer);
  let top = height, left = width, bottom = 0, right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // No visible pixels or already tight
  if (bottom < top) return pngBuffer;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW === width && cropH === height) return pngBuffer;

  return cropPng(pngBuffer, { left, top, width: cropW, height: cropH });
}

// Ref-counted stderr suppressor — safe for overlapping extractPdf() calls.
let _origStderrWrite: typeof process.stderr.write | null = null;
let _stderrSuppressCount = 0;

function suppressStderr(): void {
  if (_stderrSuppressCount++ === 0) {
    _origStderrWrite = process.stderr.write;
    process.stderr.write = ((_chunk: unknown, _enc?: unknown, cb?: unknown) => {
      if (typeof cb === "function") cb(null);
      return true;
    }) as typeof process.stderr.write;
  }
}

function restoreStderr(): void {
  if (--_stderrSuppressCount === 0 && _origStderrWrite) {
    process.stderr.write = _origStderrWrite;
    _origStderrWrite = null;
  }
}

function openPdfFromBuffer(buffer: Buffer): MupdfDocument {
  suppressStderr();
  try {
    return mupdf.Document.openDocument(buffer, "application/pdf");
  } finally {
    restoreStderr();
  }
}

/**
 * Cheaply count the number of pages in a PDF buffer without extracting any
 * content. Used by surfaces that need a page-range upper bound before
 * extraction has run.
 */
export function countPdfPages(buffer: Buffer): number {
  const doc = openPdfFromBuffer(buffer);
  try {
    return doc.countPages();
  } finally {
    doc.destroy();
  }
}

const METADATA_KEYS: [keyof PdfMetadata, string][] = [
  ["title", "info:Title"],
  ["author", "info:Author"],
  ["subject", "info:Subject"],
  ["keywords", "info:Keywords"],
  ["creator", "info:Creator"],
  ["producer", "info:Producer"],
  ["creationDate", "info:CreationDate"],
  ["modificationDate", "info:ModDate"],
  ["format", "format"],
  ["encryption", "encryption"],
];

function extractPdfMetadata(doc: MupdfDocument): PdfMetadata {
  const metadata: PdfMetadata = {};
  for (const [key, mupdfKey] of METADATA_KEYS) {
    const value = doc.getMetaData(mupdfKey);
    if (value) {
      metadata[key] = value;
    }
  }
  return metadata;
}

async function extractPage(doc: MupdfDocument, pageIndex: number, vectorTextGrouping: boolean = true, fixedLayout: boolean = false): Promise<ExtractedPage> {
  const pageNum = pageIndex + 1;
  const pageId = "pg" + String(pageNum).padStart(3, "0");

  const page = doc.loadPage(pageIndex);

  // Render full-page image at 2x scale (~144 DPI)
  const matrix = mupdf.Matrix.scale(2, 2);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
  const pagePngBuf = Buffer.from(pixmap.asPNG());

  const pageImage: ExtractedImage = {
    imageId: `${pageId}_page`,
    pageId,
    buffer: pagePngBuf,
    format: "png",
    width: pagePngBuf.readUInt32BE(16),
    height: pagePngBuf.readUInt32BE(20),
    hash: hashBuffer(pagePngBuf),
  };

  // Extract text (handles legacy FM Sinhala font remapping when detected)
  const stext = page.toStructuredText();
  const text = extractTextFromStructuredText(stext);
  const fontStats = tallyFontCategories(stext);
  const pageBounds = page.getBounds();
  const textShapes = extractTextShapes(stext, 0, pageBounds[2] - pageBounds[0]);

  // Extract raster images directly from PDF objects (not SVG)
  const pdfDoc = doc as unknown as PDFDocument;
  const pdfPage = page as unknown as PDFPage;
  const allRasterImages = extractRasterImagesFromPdf(pdfDoc, pdfPage, pageId);

  // Extract vector shapes and figure groups from SVG (text shapes participate in grouping when enabled)
  const pageSvg = getPageSvg(page);
  const { images: figureImagesRaw, coveredRasterHashes, debug: extractionDebug } = await extractVectorImagesFromSvg(
    pageSvg, pageId, allRasterImages.length, pagePngBuf, vectorTextGrouping ? textShapes : undefined
  );
  let figureImages = figureImagesRaw;

  // Filter out raster images that are covered by figure groups (dedup)
  const rasterImages = coveredRasterHashes.size > 0
    ? allRasterImages.filter(img => !coveredRasterHashes.has(img.hash))
    : allRasterImages;

  // Positioned-text + stream-order extraction (page geometry) is now produced
  // for EVERY book — it's strategy-independent data, and producing it always
  // lets the user switch the render strategy to fixed-layout at the storyboard
  // step without re-extracting the PDF. It's a pure-local mupdf pass (no LLM).
  //
  // Stream-order assignment: run the page through a recording device so every
  // draw op gets a true PDF content-stream seqno. mupdf's StructuredText walker
  // is a layout reconstruction (reading flow, not stream order) so it can't be
  // used for z-order — but the device callbacks fire once per content-stream
  // operator, in stream order, with fully-resolved CTMs.
  const recorder = runRecorderInViewport(page, pageBounds, 0, 0);
  stampRasterPlacementsFromOps(rasterImages, recorder.ops);

  // Reuse the StructuredText already built above — no extra pass. Build
  // positioned text at fixed-layout quality (spacing cleanup on) so the data is
  // ready regardless of when the user picks fixed-layout.
  const paragraphData = parsePageParagraphs(page, stext, 2, true);
  // Fold hand-lettered vector paint into the duplicate selectable text run.
  const { restyledBoxes } = restyleCoincidentVectorText(paragraphData.paragraphs, recorder.ops);
  // Dropping the now-duplicate vector shapes CHANGES the image set, so keep it
  // gated to fixed-layout — reflowable image output stays exactly as before.
  // (A reflowable-extracted book later switched to fixed-layout may therefore
  // show duplicate vector lettering until re-extracted; a narrow, cosmetic case.)
  if (fixedLayout) {
    figureImages = await excludeConsumedFigureShapes(figureImages, restyledBoxes);
  }
  // Figure seqnos stamped after dedup so re-rendered survivors get true order.
  stampFigureSeqnosFromOps(figureImages, recorder.ops);

  const positionedText: PositionedTextOutput = buildPositionedTextOutput(
    pageId,
    paragraphData,
    rasterImages,
    figureImages,
    recorder.ops,
  );

  return {
    pageId,
    pageNumber: pageNum,
    text,
    pageImage,
    images: [...rasterImages, ...figureImages],
    positionedText,
    extractionDebug,
    fontStats,
  };
}

// ── Stream-order recorder integration ─────────────────────────────────

/**
 * Run the device recorder and translate every op's geometry into viewport
 * space — i.e. the page's mupdf-normalized y-down coordinates with the
 * page origin subtracted out and an optional `xShift` for spread
 * right-pages. The recorder already returns y-down coords (mupdf flips PDF
 * user-space internally before invoking device callbacks), so this is just
 * an origin shift, not a coordinate-system flip.
 *
 * `seqnoShift` lets callers offset the spread's right-page seqnos past the
 * left page so cross-page sort puts left-before-right.
 */
function runRecorderInViewport(
  page: AnyPage,
  pageBounds: number[],
  xShift: number,
  seqnoShift: number,
): { ops: StreamOp[] } {
  const pageOriginX = pageBounds[0];
  const pageOriginY = pageBounds[1];
  const rawOps = recordPageStream(page);
  const dx = -pageOriginX + xShift;
  const dy = -pageOriginY;
  const shiftBBox = (b: StreamBBox): StreamBBox => ({
    x0: b.x0 + dx,
    y0: b.y0 + dy,
    x1: b.x1 + dx,
    y1: b.y1 + dy,
  });
  const shiftClipPaths = (clips: ClipPath[]): ClipPath[] =>
    clips.map((c) => ({
      evenOdd: c.evenOdd,
      bbox: shiftBBox(c.bbox),
      commands: c.commands.map((cmd): PathCommand => {
        switch (cmd.op) {
          case "M":
          case "L":
            return { op: cmd.op, x: cmd.x + dx, y: cmd.y + dy };
          case "C":
            return {
              op: "C",
              x1: cmd.x1 + dx,
              y1: cmd.y1 + dy,
              x2: cmd.x2 + dx,
              y2: cmd.y2 + dy,
              x3: cmd.x3 + dx,
              y3: cmd.y3 + dy,
            };
          case "Z":
            return cmd;
        }
      }),
    }));
  const ops: StreamOp[] = rawOps.map((op): StreamOp => {
    const seqno = op.seqno + seqnoShift;
    const activeClipBbox = op.activeClipBbox ? shiftBBox(op.activeClipBbox) : null;
    if (op.kind === "image" || op.kind === "imageMask") {
      return {
        ...op,
        seqno,
        bbox: shiftBBox(op.bbox),
        activeClipBbox,
        activeClipPaths: shiftClipPaths(op.activeClipPaths),
      };
    }
    if (op.kind === "fillText" || op.kind === "strokeText") {
      return {
        ...op,
        seqno,
        bbox: shiftBBox(op.bbox),
        glyphs: op.glyphs.map((g) => ({
          rune: g.rune,
          x: g.x - pageOriginX + xShift,
          y: g.y - pageOriginY,
        })),
        activeClipBbox,
      };
    }
    // fillPath / strokePath / shade
    if (op.kind === "fillPath" || op.kind === "strokePath") {
      return {
        ...op,
        seqno,
        bbox: shiftBBox(op.bbox),
        geomBbox: shiftBBox(op.geomBbox),
        activeClipBbox,
      };
    }
    return { ...op, seqno, bbox: shiftBBox(op.bbox), activeClipBbox };
  });
  return { ops };
}

type AnyPage = ReturnType<MupdfDocument["loadPage"]>;

function bboxToImageBounds(b: StreamBBox): ImageBounds {
  return { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
}

/** Serialize PathCommand[] to an SVG `d` attribute string in absolute coords. */
function pathCommandsToSvgD(cmds: PathCommand[]): string {
  const fmt = (n: number): string => {
    // Round to 2 decimal places; strip trailing zeros / dot.
    const s = n.toFixed(2);
    return s.replace(/\.?0+$/, "");
  };
  const parts: string[] = [];
  for (const c of cmds) {
    switch (c.op) {
      case "M":
        parts.push(`M${fmt(c.x)} ${fmt(c.y)}`);
        break;
      case "L":
        parts.push(`L${fmt(c.x)} ${fmt(c.y)}`);
        break;
      case "C":
        parts.push(
          `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x3)} ${fmt(c.y3)}`,
        );
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join("");
}

/** Pick the most-restrictive active clip for an image op, returning its SVG
 *  `d` string in viewport coords — or undefined if no clip meaningfully
 *  reduces the visible area. PDF semantics intersect the full clip stack;
 *  the innermost is typically the binding constraint for storybook PDFs
 *  (one clip-and-paint per image). If multiple clips are active, we score
 *  each by how much it cuts into the image and pick the most restrictive. */
function selectImageClipPath(op: ImageStreamOp): string | undefined {
  if (op.activeClipPaths.length === 0) return undefined;
  const imgArea =
    Math.max(0, op.bbox.x1 - op.bbox.x0) *
    Math.max(0, op.bbox.y1 - op.bbox.y0);
  if (imgArea <= 0) return undefined;

  let best: ClipPath | undefined;
  let bestOverlap = Infinity;
  for (const clip of op.activeClipPaths) {
    if (clip.commands.length === 0) continue;
    const ix0 = Math.max(clip.bbox.x0, op.bbox.x0);
    const iy0 = Math.max(clip.bbox.y0, op.bbox.y0);
    const ix1 = Math.min(clip.bbox.x1, op.bbox.x1);
    const iy1 = Math.min(clip.bbox.y1, op.bbox.y1);
    const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    const overlapRatio = interArea / imgArea;
    if (overlapRatio < bestOverlap) {
      bestOverlap = overlapRatio;
      best = clip;
    }
  }
  // Skip when the clip barely reduces the visible area (≥95% overlap means
  // the clip is just the page or a containing region, not a meaningful crop).
  if (!best || bestOverlap >= 0.95) return undefined;
  return pathCommandsToSvgD(best.commands);
}

/**
 * Match each `fillImage` / `fillImageMask` op to an extracted raster XObject
 * by native pixel dimensions, consuming candidates in stream order. The
 * matched raster gets its `streamSeqno` and its `bounds` (from the op's CTM)
 * stamped on it.
 *
 * Multiple instances of the same image dimensions are paired in stream
 * order — first op with WxH matches first remaining ExtractedImage with
 * WxH. This is how mupdf placement order maps to XObject extraction order.
 */
function stampRasterPlacementsFromOps(
  rasters: ExtractedImage[],
  ops: StreamOp[],
): void {
  const byDim = new Map<string, ExtractedImage[]>();
  for (const img of rasters) {
    const key = `${img.width}x${img.height}`;
    const arr = byDim.get(key) ?? [];
    arr.push(img);
    byDim.set(key, arr);
  }
  for (const op of ops) {
    if (op.kind !== "image" && op.kind !== "imageMask") continue;
    const candidates = byDim.get(`${op.nativeWidth}x${op.nativeHeight}`);
    const matched = candidates?.shift();
    if (!matched) continue;
    matched.streamSeqno = op.seqno;
    matched.bounds = bboxToImageBounds(op.bbox);
    const clipD = selectImageClipPath(op);
    if (clipD) matched.clipPath = clipD;
    if (op.blendMode && op.blendMode !== "Normal") {
      matched.blendMode = pdfBlendModeToCss(op.blendMode);
    }
    if (typeof op.alpha === "number" && op.alpha < 1) {
      // Round to 3 decimal places — finer than display can reliably reproduce.
      matched.opacity = Math.max(0, Math.round(op.alpha * 1000) / 1000);
    }
  }
}

/** Map mupdf's PDF BlendMode string to a CSS `mix-blend-mode` keyword.
 *  PDF blend mode names are CamelCase ("ColorDodge"); CSS keywords are
 *  kebab-case lowercase ("color-dodge"). Returns the input lowercased
 *  with a hyphen between word boundaries. */
function pdfBlendModeToCss(mode: string): string {
  return mode
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Stamp `streamSeqno` on each vector figure with its true PDF
 * content-stream position, by tying recorder path ops back to the figure
 * by exact geometry identity.
 *
 * Each figure carries `shapeGeomBoxes` — the geometry bboxes of its
 * constituent SVG shapes, in recorder space. A recorder path op is the
 * same draw as one of those shapes iff their geometry bboxes coincide
 * (same path, same CTM, same page space → identical geometry extent;
 * `geomBbox` excludes stroke inflation so a stroked op still matches its
 * shape). The figure's seqno is the minimum seqno over matched ops — the
 * moment it begins drawing — which preserves z-order against later ops
 * (text, other figures) that draw on top of it.
 *
 * This replaces the previous aggregate bbox-containment heuristic, which
 * silently failed for stroked figures (a strokePath's rendered bounds
 * spill outside the figure's geometry box, so containment never matched
 * and the figure kept an unreliable SVG-document-order seqno — drawing it
 * behind content it should sit on top of).
 */
function stampFigureSeqnosFromOps(
  figures: ExtractedImage[],
  ops: StreamOp[],
): void {
  const pathOps: PathStreamOp[] = ops.filter(
    (o): o is PathStreamOp => o.kind === "fillPath" || o.kind === "strokePath",
  );
  // SVG export rounds coords to 2 decimals; getBounds is full precision.
  const TOL = 1;
  const eq = (a: number, b: number): boolean => Math.abs(a - b) <= TOL;
  for (const fig of figures) {
    const boxes = fig.shapeGeomBoxes;
    if (!boxes || boxes.length === 0) continue; // keeps SVG-order fallback
    let minSeqno = Infinity;
    for (const op of pathOps) {
      const g = op.geomBbox;
      const hit = boxes.some(
        (b) => eq(g.x0, b[0]) && eq(g.y0, b[1]) && eq(g.x1, b[2]) && eq(g.y1, b[3]),
      );
      if (hit && op.seqno < minSeqno) minSeqno = op.seqno;
    }
    if (Number.isFinite(minSeqno)) fig.streamSeqno = minSeqno;
  }
}

/**
 * For each asHTML paragraph, find the `fillText` op whose first glyph sits
 * at the paragraph's anchor (left, top + lineHeight ≈ baseline). Returns
 * the matched op's seqno, or null if no match.
 *
 * mupdf coalesces multiple asHTML paragraphs into a single `fillText` op
 * when they share font/style — that's fine, all those paragraphs simply
 * share the same stream seqno.
 */
function matchParagraphSeqno(
  p: AsHtmlParagraph,
  textOps: TextStreamOp[],
): number | null {
  // Both glyph and asHTML coords are in the page's y-down viewport. asHTML
  // `top` is the top of the line box; the glyph baseline sits one
  // line-height below.
  const expectedX = p.left;
  const expectedY = p.top + p.lineHeight;
  let bestSeqno: number | null = null;
  let bestDist = Infinity;
  for (const op of textOps) {
    for (const g of op.glyphs) {
      const dx = Math.abs(g.x - expectedX);
      const dy = Math.abs(g.y - expectedY);
      if (dy < Math.max(p.lineHeight, 4) && dx < 4) {
        const d = dx + dy * 2;
        if (d < bestDist) {
          bestDist = d;
          bestSeqno = op.seqno;
        }
      }
    }
  }
  return bestSeqno;
}

type Segment = AsHtmlParagraph["segments"][number];

/** A path op's geometry bbox is "inside" a text run's glyph box when it
 *  sits within it, give or take `tol` (SVG export rounds to 2dp). */
function geomInside(
  inner: { x0: number; y0: number; x1: number; y1: number },
  outer: { x0: number; y0: number; x1: number; y1: number },
  tol: number,
): boolean {
  return (
    inner.x0 >= outer.x0 - tol &&
    inner.y0 >= outer.y0 - tol &&
    inner.x1 <= outer.x1 + tol &&
    inner.y1 <= outer.y1 + tol
  );
}

/** Single dominant value of a string list, or null if no strict majority. */
function majority(vals: string[]): string | null {
  if (vals.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) (best = v), (bestN = n);
  return bestN * 2 > vals.length ? best : null;
}

/**
 * Restyle text runs that duplicate hand-lettered vector art, faithfully,
 * from the vector's own paint — so the *selectable text* carries the
 * visual the PDF intended and the duplicate vector can be dropped
 * (translation / TTS / glossary all operate on clean text).
 *
 * mupdf opens a new `fillText` op on every graphics-state change
 * (incl. fill colour / font) — exactly where `groupIntoSegments` splits
 * runs — so a styled segment maps to a `fillText` op; that op's bbox is
 * the run's extent in the same viewport space as path ops' `geomBbox`.
 *
 * For a segment whose run box contains path ops:
 *  - all-`strokePath`  → the vector is the glyph's outline: keep the run's
 *    fill colour, add a faithful `-webkit-text-stroke` from the stroke
 *    op's colour + width (e.g. hollow "white").
 *  - all-`fillPath`    → the vector IS the visible glyph and the run's
 *    colour is an invisible shim: recolour the run to the fill colour,
 *    no stroke (e.g. solid black hand-drawn `h`).
 *  - mixed             → both.
 *  - colour disagreement / no run match → leave untouched (safe no-op;
 *    never worse than today).
 *
 * Returns the set of path-op seqnos consumed by a restyle, so a later
 * pass can exclude the now-duplicate vector shapes.
 */
function restyleCoincidentVectorText(
  paragraphs: AsHtmlParagraph[],
  ops: StreamOp[],
): { consumed: Set<number>; restyledBoxes: BBox[] } {
  const consumed = new Set<number>();
  // Glyph boxes of runs we restyled. A figure shape that sits inside one
  // of these is the vector duplicate of already-restyled text and is
  // excluded — robust to a glyph being one SVG shape but many recorder
  // subpath ops (op-bbox equality isn't).
  const restyledBoxes: BBox[] = [];
  const pathOps = ops.filter(
    (o): o is PathStreamOp => o.kind === "fillPath" || o.kind === "strokePath",
  );
  if (pathOps.length === 0) return { consumed, restyledBoxes };
  const textOps = ops.filter(
    (o): o is TextStreamOp => o.kind === "fillText" || o.kind === "strokeText",
  );
  const TOL = 1;
  const isWs = (c: string): boolean => /\s/.test(c);

  for (const p of paragraphs) {
    if (!p.segments || p.segments.length === 0) continue;
    const baseline = p.top + p.lineHeight;
    // Glyphs on THIS paragraph's line, gathered across every text op and
    // filtered by per-glyph y: a uniform-style heading is coalesced by
    // mupdf into ONE op spanning multiple lines/segments, so an op can't
    // be matched whole to a segment. Per-glyph y picks only this line's
    // glyphs out of such an op.
    const lineGlyphs: { rune: string; x: number }[] = [];
    for (const op of textOps) {
      for (const g of op.glyphs) {
        if (Math.abs(g.y - baseline) < Math.max(p.lineHeight, 4)) {
          lineGlyphs.push({ rune: g.rune, x: g.x });
        }
      }
    }
    if (lineGlyphs.length === 0) continue;
    lineGlyphs.sort((a, b) => a.x - b.x);

    // Align each segment to its own glyph sub-span by a whitespace-tolerant
    // two-pointer walk (segments concatenate to the line text). The segment
    // box is the extent of just its glyphs — works whether the run is its
    // own op or part of a coalesced multi-segment op, and repeated letters
    // map to successive glyphs (cursor advances), so each occurrence's
    // coincident vector is consumed independently.
    let gi = 0;
    for (const seg of p.segments as Segment[]) {
      const txt = seg.text;
      const trimmedLen = txt.replace(/\s+$/, "").length;
      const start = gi;
      let si = 0;
      while (si < txt.length && gi < lineGlyphs.length) {
        const sc = txt[si];
        const gc = lineGlyphs[gi].rune;
        if (sc === gc) {
          si++;
          gi++;
        } else if (isWs(sc)) {
          si++; // segment whitespace absent from glyph stream
        } else if (isWs(gc)) {
          gi++; // extra whitespace glyph (letter-spacing artefact)
        } else {
          break; // real mismatch — give up on this segment
        }
      }
      if (trimmedLen === 0 || si < trimmedLen) continue; // unmatched → skip
      const segGlyphs = lineGlyphs.slice(start, gi);
      if (segGlyphs.length === 0) continue;
      const last = segGlyphs[segGlyphs.length - 1];
      // A per-line y band proportional to lineHeight: tall enough for a
      // decorative glyph's ascender / hand-drawn stroke overhang, but tied
      // to THIS line — NOT the op's bbox (a uniform body block is one
      // coalesced op whose bbox spans the whole multi-line paragraph;
      // using it swallowed unrelated path ops and restyled body text).
      const segBox = {
        x0: segGlyphs[0].x,
        // Next glyph's x bounds the run on the right; fall back to a rough
        // em past the last glyph for the line's final segment.
        x1: lineGlyphs[gi]?.x ?? last.x + p.lineHeight,
        y0: p.top - 0.1 * p.lineHeight,
        y1: p.top + 1.5 * p.lineHeight,
      };

      const hits = pathOps.filter((po) => geomInside(po.geomBbox, segBox, TOL));
      if (hits.length === 0) continue;

      const strokes = hits.filter((h) => h.kind === "strokePath");
      const fills = hits.filter((h) => h.kind === "fillPath");
      // Per-role colour majority. A fill colour differing from a stroke
      // colour is normal (e.g. white fill + black outline) — only
      // disagreement *within* a role is ambiguous and skipped.
      const fillColor = fills.length ? majority(fills.map((f) => f.color)) : null;
      const strokeColor = strokes.length ? majority(strokes.map((s) => s.color)) : null;
      const style = (seg.style ??= {});
      let applied = false;

      if (fillColor) {
        // Fill role: the vector is the visible glyph; adopt its colour.
        style.color = fillColor;
        applied = true;
      }
      if (strokeColor) {
        // Stroke role: faithful outline from the PDF's own stroke.
        const widths = strokes
          .map((s) => s.strokeWidth ?? 0)
          .filter((w) => w > 0)
          .sort((a, b) => a - b);
        const w = widths.length ? widths[widths.length >> 1] : 1;
        style["-webkit-text-stroke"] = `${Math.max(1, Math.round(w))}px ${strokeColor}`;
        style["paint-order"] = "stroke fill";
        applied = true;
      } else if (applied) {
        // Pure fill role — clear any stale stroke styling.
        delete style["-webkit-text-stroke"];
        delete style["paint-order"];
      }

      if (!applied) continue; // ambiguous within a role → faithful no-op
      for (const h of hits) consumed.add(h.seqno);
      restyledBoxes.push([segBox.x0, segBox.y0, segBox.x1, segBox.y1]);
    }
  }
  return { consumed, restyledBoxes };
}

/**
 * Assemble the final `PositionedTextOutput` from extracted images + vector
 * figures + asHTML paragraphs, sorting everything by its true PDF
 * content-stream seqno.
 *
 * - Each raster has its `streamSeqno` and `bounds` already stamped by
 *   `stampRasterPlacementsFromOps`.
 * - Each vector figure has its `streamSeqno` stamped by
 *   `stampFigureSeqnosFromOps`.
 * - Each paragraph gets its seqno here by matching its anchor to a
 *   `fillText` op's first matching glyph. Paragraphs that share a fillText
 *   op (mupdf coalesces same-font runs) get the same seqno; we add a tiny
 *   index-based offset so they sort stably amongst themselves.
 */
function buildPositionedTextOutput(
  pageId: string,
  paragraphData: { paragraphs: AsHtmlParagraph[] } & PageGeometry,
  rasterImages: ExtractedImage[],
  vectorImages: ExtractedImage[],
  ops: StreamOp[],
): PositionedTextOutput {
  type Item =
    | {
        seqno: number;
        kind: "image";
        imageId: string;
        bounds: ImageBounds;
        clipPath?: string;
        blendMode?: string;
        opacity?: number;
      }
    | {
        seqno: number;
        kind: "paragraph";
        textId: string;
        top: number;
        left: number;
        lineHeight: number;
        segments: AsHtmlParagraph["segments"];
        text: string;
        blockId?: string;
        blockBounds?: AsHtmlParagraph["blockBounds"];
        mergedParagraphId?: string;
        textAlign?: AsHtmlParagraph["textAlign"];
      };
  const items: Item[] = [];

  for (const img of [...rasterImages, ...vectorImages]) {
    if (!img.bounds || img.streamSeqno === undefined) continue;
    items.push({
      seqno: img.streamSeqno,
      kind: "image",
      imageId: img.imageId,
      bounds: img.bounds,
      clipPath: img.clipPath,
      blendMode: img.blendMode,
      opacity: img.opacity,
    });
  }

  const textOps: TextStreamOp[] = ops.filter(
    (o): o is TextStreamOp => o.kind === "fillText" || o.kind === "strokeText",
  );
  // Paragraphs not matched to a fillText op are pinned just past the last
  // recorded op so they still sort above visual content. This is a safety
  // net — when we can't unicode-decode glyphs (rare fonts/encodings the
  // /ToUnicode CMap omits), we keep the paragraph but let it draw last.
  const lastOpSeqno = ops.reduce((m, o) => Math.max(m, o.seqno), 0);

  paragraphData.paragraphs.forEach((p, idx) => {
    const matched = matchParagraphSeqno(p, textOps);
    // Tiny per-paragraph offset breaks ties when multiple paragraphs share
    // a fillText op (mupdf coalesces same-font runs); preserves asHTML
    // emission order within a single op.
    const seqno = (matched ?? lastOpSeqno + 1) + (idx + 1) * 1e-6;
    items.push({
      seqno,
      kind: "paragraph",
      textId: `${pageId}_p${String(idx).padStart(3, "0")}`,
      top: p.top,
      left: p.left,
      lineHeight: p.lineHeight,
      segments: p.segments,
      text: p.text,
      blockId: p.blockId,
      blockBounds: p.blockBounds,
      mergedParagraphId: p.mergedParagraphId,
      textAlign: p.textAlign,
    });
  });

  items.sort((a, b) => a.seqno - b.seqno);

  const drawItems: DrawItem[] = items.map((i) => {
    if (i.kind === "image") {
      return {
        kind: "image",
        imageId: i.imageId,
        bounds: i.bounds,
        ...(i.clipPath ? { clipPath: i.clipPath } : {}),
        ...(i.blendMode ? { blendMode: i.blendMode } : {}),
        ...(typeof i.opacity === "number" ? { opacity: i.opacity } : {}),
      };
    }
    return {
      kind: "paragraph",
      textId: i.textId,
      top: i.top,
      left: i.left,
      lineHeight: i.lineHeight,
      segments: i.segments,
      text: i.text,
      ...(i.blockId !== undefined ? { blockId: i.blockId } : {}),
      ...(i.blockBounds !== undefined ? { blockBounds: i.blockBounds } : {}),
      ...(i.mergedParagraphId !== undefined ? { mergedParagraphId: i.mergedParagraphId } : {}),
      ...(i.textAlign !== undefined ? { textAlign: i.textAlign } : {}),
    };
  });

  return {
    drawItems,
    pageWidth: paragraphData.pageWidth,
    pageHeight: paragraphData.pageHeight,
    renderWidth: paragraphData.renderWidth,
    renderHeight: paragraphData.renderHeight,
  };
}

/**
 * Extract a spread (two adjacent pages merged side by side).
 * PageId is the concatenation of both physical page numbers, e.g. "pg002003".
 */
async function extractSpreadPage(
  doc: MupdfDocument,
  leftIndex: number,
  rightIndex: number,
  vectorTextGrouping: boolean = true,
  fixedLayout: boolean = false,
): Promise<ExtractedPage> {
  const leftNum = leftIndex + 1;
  const rightNum = rightIndex + 1;
  const pageId =
    "pg" +
    String(leftNum).padStart(3, "0") +
    String(rightNum).padStart(3, "0");

  const leftPage = doc.loadPage(leftIndex);
  const rightPage = doc.loadPage(rightIndex);

  // Render both pages and stitch side by side
  const matrix = mupdf.Matrix.scale(2, 2);
  const leftPng = Buffer.from(
    leftPage.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false).asPNG()
  );
  const rightPng = Buffer.from(
    rightPage.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false).asPNG()
  );
  const pagePngBuf = stitchPngsHorizontally(leftPng, rightPng);

  const pageImage: ExtractedImage = {
    imageId: `${pageId}_page`,
    pageId,
    buffer: pagePngBuf,
    format: "png",
    width: pagePngBuf.readUInt32BE(16),
    height: pagePngBuf.readUInt32BE(20),
    hash: hashBuffer(pagePngBuf),
  };

  // Concatenate text from both pages (handles legacy FM Sinhala font remapping)
  const leftStext = leftPage.toStructuredText();
  const rightStext = rightPage.toStructuredText();
  const leftText = extractTextFromStructuredText(leftStext);
  const rightText = extractTextFromStructuredText(rightStext);
  const text = leftText + "\n" + rightText;
  const leftFontStats = tallyFontCategories(leftStext);
  const rightFontStats = tallyFontCategories(rightStext);
  const fontStats = {
    serifChars: leftFontStats.serifChars + rightFontStats.serifChars,
    sansChars: leftFontStats.sansChars + rightFontStats.sansChars,
  };
  const leftBounds = leftPage.getBounds();
  const rightBounds = rightPage.getBounds();
  const leftTextShapes = extractTextShapes(leftStext, 0, leftBounds[2] - leftBounds[0]);
  const rightTextShapes = extractTextShapes(rightStext, leftTextShapes.length, rightBounds[2] - rightBounds[0]);

  // Extract raster images from both pages
  const pdfDoc = doc as unknown as PDFDocument;
  const leftPdfPage = leftPage as unknown as PDFPage;
  const rightPdfPage = rightPage as unknown as PDFPage;
  const allLeftRaster = extractRasterImagesFromPdf(pdfDoc, leftPdfPage, pageId);
  const allRightRaster = extractRasterImagesFromPdf(pdfDoc, rightPdfPage, pageId, allLeftRaster.length);

  // Extract vector shapes and figure groups from both pages
  const leftSvg = getPageSvg(leftPage);
  const rightSvg = getPageSvg(rightPage);
  const rasterCount = allLeftRaster.length + allRightRaster.length;
  const leftPageWidthPt = leftBounds[2] - leftBounds[0];
  const leftResult = await extractVectorImagesFromSvg(leftSvg, pageId, rasterCount, leftPng, vectorTextGrouping ? leftTextShapes : undefined);
  const rightResult = await extractVectorImagesFromSvg(
    rightSvg,
    pageId,
    rasterCount + leftResult.images.length,
    rightPng,
    vectorTextGrouping ? rightTextShapes : undefined,
    leftPageWidthPt,
  );

  // Merge covered hashes from both pages and filter raster images
  const coveredRasterHashes = new Set([
    ...leftResult.coveredRasterHashes,
    ...rightResult.coveredRasterHashes,
  ]);
  const leftRaster = coveredRasterHashes.size > 0
    ? allLeftRaster.filter(img => !coveredRasterHashes.has(img.hash))
    : allLeftRaster;
  const rightRaster = coveredRasterHashes.size > 0
    ? allRightRaster.filter(img => !coveredRasterHashes.has(img.hash))
    : allRightRaster;

  // Merge debug from both pages
  const extractionDebug: ExtractionDebugOutput = {
    pageId,
    totalShapes: leftResult.debug.totalShapes + rightResult.debug.totalShapes,
    totalTextShapes: leftResult.debug.totalTextShapes + rightResult.debug.totalTextShapes,
    totalVectorShapes: leftResult.debug.totalVectorShapes + rightResult.debug.totalVectorShapes,
    totalImageShapes: leftResult.debug.totalImageShapes + rightResult.debug.totalImageShapes,
    backgroundsFiltered: leftResult.debug.backgroundsFiltered + rightResult.debug.backgroundsFiltered,
    groupsBeforeMerge: leftResult.debug.groupsBeforeMerge + rightResult.debug.groupsBeforeMerge,
    groupsAfterMerge: leftResult.debug.groupsAfterMerge + rightResult.debug.groupsAfterMerge,
    textOnlyGroupsSkipped: leftResult.debug.textOnlyGroupsSkipped + rightResult.debug.textOnlyGroupsSkipped,
    tooSmallGroupsSkipped: leftResult.debug.tooSmallGroupsSkipped + rightResult.debug.tooSmallGroupsSkipped,
    groups: [...leftResult.debug.groups, ...rightResult.debug.groups],
  };

  // Fixed-layout places individual halves at their original positions, so no
  // spread-level image stitching is needed — the two halves, each with their
  // own PDF-point bounds, compose correctly on the rendered spread viewport.
  const rasterImages = [...leftRaster, ...rightRaster];

  // Positioned-text + stream-order extraction (page geometry) is now produced
  // for EVERY book so fixed-layout can be chosen later without re-extracting
  // (see extractPage for rationale). Pure-local mupdf pass.
  //
  // Run the recorder on both pages, in viewport coords; right-page x is shifted
  // by left page width so positions address the stitched spread, and right-page
  // seqnos shift past left so cross-page sort puts left ahead of right.
  const leftRecorder = runRecorderInViewport(leftPage, leftBounds, 0, 0);
  const leftMaxSeqno = leftRecorder.ops.reduce(
    (m, o) => Math.max(m, o.seqno),
    -1,
  );
  const rightRecorder = runRecorderInViewport(
    rightPage,
    rightBounds,
    leftPageWidthPt,
    leftMaxSeqno + 1,
  );
  const ops: StreamOp[] = [...leftRecorder.ops, ...rightRecorder.ops];
  // Rasters: stamp per page so dim-tied images on different pages don't
  // pair across the spread boundary.
  stampRasterPlacementsFromOps(leftRaster, leftRecorder.ops);
  stampRasterPlacementsFromOps(rightRaster, rightRecorder.ops);

  // Reuse the per-page StructuredText already built above — no extra pass.
  const paragraphData = parsePageParagraphsSpread(leftPage, rightPage, leftStext, rightStext, 2, true);
  const { restyledBoxes } = restyleCoincidentVectorText(paragraphData.paragraphs, ops);
  // The destructive figure dedup stays gated to fixed-layout so reflowable
  // image output is unchanged (see extractPage).
  let figureImages: ExtractedImage[] = [...leftResult.images, ...rightResult.images];
  if (fixedLayout) {
    figureImages = await excludeConsumedFigureShapes(figureImages, restyledBoxes);
  }
  stampFigureSeqnosFromOps(figureImages, ops);

  const positionedText: PositionedTextOutput = buildPositionedTextOutput(
    pageId,
    paragraphData,
    rasterImages,
    figureImages,
    ops,
  );

  const images: ExtractedImage[] = [...rasterImages, ...figureImages];

  return {
    pageId,
    pageNumber: leftNum,
    text,
    pageImage,
    images,
    positionedText,
    extractionDebug,
    fontStats,
  };
}

interface PageSvgData {
  svgContent: string;
  contentWithoutDefs: string;
  svgDefs: string;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Extract raster images directly from the PDF page's Resources/XObject dictionary.
 * JPEG images are extracted as raw bytes (DCTDecode); others go through mupdf → PNG.
 * Recurses into Form XObjects to find nested images.
 */
function extractRasterImagesFromPdf(
  doc: PDFDocument,
  page: PDFPage,
  pageId: string,
  startIndex: number = 0
): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const seen = new Set<number>(); // Track object numbers to avoid duplicates
  let imgIndex = startIndex;

  function extractFromXObjectDict(xobject: PDFObject): void {
    // Collect and sort XObject keys for deterministic ordering
    const entries: { key: string; obj: PDFObject }[] = [];
    xobject.forEach((obj: PDFObject, key: string | number) => {
      entries.push({ key: String(key), obj });
    });
    entries.sort((a, b) => a.key.localeCompare(b.key));

    for (const { obj } of entries) {
      const resolved = obj.isIndirect() ? obj.resolve() : obj;

      const subtype = resolved.get("Subtype");
      if (subtype.isNull()) continue;
      const subtypeName = subtype.asName();

      if (subtypeName === "Form") {
        // Recurse into Form XObjects to find nested images
        const formResources = resolved.get("Resources");
        if (!formResources.isNull()) {
          const formXObject = formResources.get("XObject");
          if (!formXObject.isNull() && formXObject.isDictionary()) {
            extractFromXObjectDict(formXObject);
          }
        }
        continue;
      }

      if (subtypeName !== "Image") continue;

      // Deduplicate by PDF object number (same image referenced multiple times)
      if (obj.isIndirect()) {
        const objNum = obj.asIndirect();
        if (seen.has(objNum)) continue;
        seen.add(objNum);
      }

      const dictWidth = resolved.get("Width").asNumber();
      const dictHeight = resolved.get("Height").asNumber();

      try {
        // Check filter to determine format
        const filter = resolved.get("Filter");
        const filterNames = filter.isNull()
          ? []
          : filter.isArray()
            ? Array.from({ length: filter.length }, (_, i) => filter.get(i).asName())
            : [filter.asName()];
        const filterName =
          filterNames.length > 0 ? filterNames[filterNames.length - 1] : "";
        let buf: Buffer;
        let format: ImageFormat;

        // Use the original (indirect) obj for stream access — resolve() strips the stream
        const streamObj = obj.isIndirect() ? obj : resolved;

        // readRawStream() only works for single-filter streams. For chained
        // filters (e.g. [FlateDecode, DCTDecode]) it returns bytes before
        // filter decoding, so we must not treat those as raw JPEG bytes.
        const isSingleFilter = filterNames.length === 1;

        // Soft-mask (SMask): the image dict points to a separate image that
        // provides the alpha channel. mupdf's toPixmap() does NOT composite
        // with the SMask, so any fast-path that bypasses mupdf (raw JPEG) or
        // just reads the color channels will leave previously-transparent
        // regions opaque black. Detect this up front so both branches handle
        // it correctly.
        const smaskObj = resolved.get("SMask");
        const hasSMask = !smaskObj.isNull();

        // Decide the cheapest correct path WITHOUT decoding. Only the
        // branches that genuinely need pixels call `doc.loadImage()`; the
        // common RGB/Gray JPEG case copies raw bytes and never touches mupdf.
        const canRawExtract =
          !hasSMask &&
          filterName === "DCTDecode" &&
          isSingleFilter &&
          classifyImageColorSpace(resolved) === "displayable";

        if (canRawExtract) {
          // Fast path: RGB/Gray JPEG with no transparency — copy bytes as-is.
          buf = Buffer.from(streamObj.readRawStream().asUint8Array());
          format = "jpeg";
        } else if (hasSMask) {
          // Composite color + soft-mask into an RGBA PNG, un-matting if the
          // SMask carries a /Matte entry (avoids colored halos at edges).
          const image = doc.loadImage(streamObj);
          const srcType = image.getColorSpace()?.getType();
          const colorPixmap = image.toPixmap();
          const maskImage = doc.loadImage(
            smaskObj.isIndirect() ? smaskObj : resolved.get("SMask")
          );
          const maskPixmap = maskImage.toPixmap();
          const matteRgb = readSoftMaskMatte(smaskObj, srcType);
          buf = compositeColorAndMask(colorPixmap, maskPixmap, matteRgb);
          format = "png";
          colorPixmap.destroy();
          maskPixmap.destroy();
          maskImage.destroy();
          image.destroy();
        } else if (filterName === "DCTDecode" && isSingleFilter) {
          // Single-filter JPEG with non-displayable colorspace (CMYK, Lab,
          // ICCBased non-RGB, etc.) — decode, convert to RGB, re-encode.
          const image = doc.loadImage(streamObj);
          const px = image.toPixmap();
          const rgb = normalizeToDisplayableRgb(px);
          buf = Buffer.from(rgb.asJPEG(90, false));
          format = "jpeg";
          if (rgb !== px) rgb.destroy();
          px.destroy();
          image.destroy();
        } else {
          // Multi-filter chains or non-JPEG without SMask: decode through
          // mupdf → PNG. Normalize to RGB first since PNG can't encode
          // CMYK/Lab/etc.
          const image = doc.loadImage(streamObj);
          const px = image.toPixmap();
          const rgb = normalizeToDisplayableRgb(px);
          buf = Buffer.from(rgb.asPNG());
          format = "png";
          if (rgb !== px) rgb.destroy();
          px.destroy();
          image.destroy();
        }

        if (buf.length === 0) continue;

        imgIndex++;
        const imgId = pageId + "_im" + String(imgIndex).padStart(3, "0");
        const dims =
          format === "jpeg" ? jpegDimensions(buf) : pngDimensions(buf);

        images.push({
          imageId: imgId,
          pageId,
          buffer: buf,
          format,
          width: dims.width || dictWidth,
          height: dims.height || dictHeight,
          hash: hashBuffer(buf),
          renderMethod: "raster",
        });
      } catch (err) {
        console.warn(
          `[extractRasterImagesFromPdf] Failed to extract image on ${pageId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  const pageObj = page.getObject();
  const resources = pageObj.get("Resources");
  if (resources.isNull()) return images;

  const xobject = resources.get("XObject");
  if (xobject.isNull() || !xobject.isDictionary()) return images;

  extractFromXObjectDict(xobject);
  return images;
}

/**
 * Minimum dimension (in points) for a vector image to be extracted.
 * Filters out tiny decorative elements like bullets or icons.
 */
const MIN_VECTOR_DIMENSION = 25;

/**
 * Shapes spanning more than this fraction of the page (in both dimensions)
 * are "background candidates". They are excluded from initial grouping to
 * prevent merging unrelated groups, but get re-attached to any group they
 * overlap. Standalone backgrounds (no overlapping group) are discarded.
 */
const BACKGROUND_THRESHOLD = 0.75;

/**
 * Margin (in points) for overlap detection when grouping shapes.
 * Positive values allow shapes to be grouped if they're within this distance.
 */
const OVERLAP_MARGIN = 2;

/**
 * Larger margin (in points) for grouping text with nearby non-text shapes.
 * Text labels (dimensions, captions) are typically positioned near but not
 * overlapping the figure elements they annotate.
 */
const TEXT_OVERLAP_MARGIN = 10;

/**
 * Maximum text line width as a ratio of page width for figure label candidacy.
 * Lines wider than this are likely body paragraphs, not figure labels/annotations.
 */
const TEXT_MAX_WIDTH_RATIO = 0.5;

/**
 * Maximum gap (in points) between small aligned groups to merge them.
 * Bridges gaps between elements in a row/column (e.g., calculator buttons)
 * without pulling in unrelated figures further away.
 */
const ROW_MERGE_GAP = 20;

/**
 * Groups smaller than this (in both dimensions) are candidates for row/column merging.
 * Larger groups are already meaningful figures and should not be merged.
 */
const ROW_MERGE_MAX_DIMENSION = 80;

type BBox = [number, number, number, number]; // [minX, minY, maxX, maxY]

interface ShapeInfo {
  /** Transformed bbox - where the shape actually appears on page */
  bbox: BBox;
  /** Original bbox from path data - for viewBox when rendering */
  originalBbox: BBox;
  seqno: number;
  /** The full SVG element string (e.g., <path d="..." fill="..."/>) */
  svgElement: string;
  /** All clip path IDs this shape is inside (for nested clips) */
  clipPathIds: string[];
  /** True if this shape represents an <image> element (raster content) */
  isImage?: boolean;
  /** SHA-256 hash prefix of the decoded image data (for dedup with raster extraction) */
  imageDataHash?: string;
  /** True if this shape represents a text line (from structured text, not SVG) */
  isText?: boolean;
  /** Character count of the text content (only set when isText is true) */
  textLength?: number;
}

/**
 * Per-vector-figure context for re-rendering a *subset* of its shapes when
 * some are excluded as text duplicates (Option A phase 4, seam (a)).
 * `group` is index-aligned with the figure's `shapeGeomBoxes`. Keyed by
 * the figure object in a WeakMap so it's transient and never persisted.
 */
interface FigureRenderCtx {
  group: ShapeInfo[];
  svgDefs: string;
  pageWidth: number;
  pageHeight: number;
  xOffset: number;
  aaGuardX: number;
  aaGuardY: number;
  /** Group contained raster image shapes → it was page-cropped from the
   *  composited page render; its pixels can't be reconstructed from the
   *  SVG shape subset, so it must never be re-rendered vector-only. */
  hadImages: boolean;
}
const figureRenderCtx = new WeakMap<ExtractedImage, FigureRenderCtx>();

/**
 * Compute the exact bounding box of a cubic Bezier curve.
 * Finds extrema by solving B'(t) = 0 for each axis.
 */
function cubicBezierBounds(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number
): BBox {
  // Endpoints are always included
  let minX = Math.min(p0x, p3x);
  let maxX = Math.max(p0x, p3x);
  let minY = Math.min(p0y, p3y);
  let maxY = Math.max(p0y, p3y);

  // Find t values where derivative = 0 for x and y
  // B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
  // Simplifies to: at² + bt + c = 0 where:
  // a = -P0 + 3P1 - 3P2 + P3
  // b = 2P0 - 4P1 + 2P2
  // c = -P0 + P1

  const solveQuadratic = (a: number, b: number, c: number): number[] => {
    const roots: number[] = [];
    if (Math.abs(a) < 1e-10) {
      // Linear case
      if (Math.abs(b) > 1e-10) {
        const t = -c / b;
        if (t > 0 && t < 1) roots.push(t);
      }
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b + sqrtD) / (2 * a);
        const t2 = (-b - sqrtD) / (2 * a);
        if (t1 > 0 && t1 < 1) roots.push(t1);
        if (t2 > 0 && t2 < 1) roots.push(t2);
      }
    }
    return roots;
  };

  // Evaluate cubic Bezier at t
  const evalCubic = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  };

  // X extrema
  const ax = -p0x + 3 * p1x - 3 * p2x + p3x;
  const bx = 2 * p0x - 4 * p1x + 2 * p2x;
  const cx = -p0x + p1x;
  for (const t of solveQuadratic(ax, bx, cx)) {
    const x = evalCubic(t, p0x, p1x, p2x, p3x);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  // Y extrema
  const ay = -p0y + 3 * p1y - 3 * p2y + p3y;
  const by = 2 * p0y - 4 * p1y + 2 * p2y;
  const cy = -p0y + p1y;
  for (const t of solveQuadratic(ay, by, cy)) {
    const y = evalCubic(t, p0y, p1y, p2y, p3y);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Compute the exact bounding box of a quadratic Bezier curve.
 * Finds extrema by solving B'(t) = 0 for each axis.
 */
function quadraticBezierBounds(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number
): BBox {
  // Endpoints are always included
  let minX = Math.min(p0x, p2x);
  let maxX = Math.max(p0x, p2x);
  let minY = Math.min(p0y, p2y);
  let maxY = Math.max(p0y, p2y);

  // B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1) = 0
  // Solving: t = (P0-P1) / (P0 - 2P1 + P2)

  const evalQuadratic = (t: number, p0: number, p1: number, p2: number): number => {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  };

  // X extremum
  const denomX = p0x - 2 * p1x + p2x;
  if (Math.abs(denomX) > 1e-10) {
    const tx = (p0x - p1x) / denomX;
    if (tx > 0 && tx < 1) {
      const x = evalQuadratic(tx, p0x, p1x, p2x);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }

  // Y extremum
  const denomY = p0y - 2 * p1y + p2y;
  if (Math.abs(denomY) > 1e-10) {
    const ty = (p0y - p1y) / denomY;
    if (ty > 0 && ty < 1) {
      const y = evalQuadratic(ty, p0y, p1y, p2y);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Compute the exact bounding box of an elliptical arc using SVG arc
 * center-parameterization. Finds extrema by evaluating at cardinal
 * angles (0, pi/2, pi, 3pi/2) that fall within the swept range.
 */
function arcBounds(
  x0: number, y0: number,
  rx: number, ry: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  x1: number, y1: number
): BBox {
  // Endpoints are always included
  let minX = Math.min(x0, x1);
  let maxX = Math.max(x0, x1);
  let minY = Math.min(y0, y1);
  let maxY = Math.max(y0, y1);

  // Handle degenerate cases
  if (rx === 0 || ry === 0) return [minX, minY, maxX, maxY];

  // Ensure radii are positive
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const phi = rotation * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1') — midpoint in rotated frame
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: Correct radii if too small
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Step 3: Compute center point (cx', cy') in rotated frame
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) /
           (rxSq * y1pSq + rySq * x1pSq);
  if (sq < 0) sq = 0;
  let sign = (largeArc === sweep) ? -1 : 1;
  const cxp = sign * Math.sqrt(sq) * (rx * y1p / ry);
  const cyp = sign * Math.sqrt(sq) * -(ry * x1p / rx);

  // Step 4: Compute center in original coordinates
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const cx = cosPhi * cxp - sinPhi * cyp + midX;
  const cy = sinPhi * cxp + cosPhi * cyp + midY;

  // Step 5: Compute start angle and sweep angle
  const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  };

  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = vectorAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  const theta2 = theta1 + dtheta;

  // Step 6: Check if cardinal angles fall within the swept range
  // At angle t on the ellipse, point = center + rotate(phi) * (rx*cos(t), ry*sin(t))
  // Extrema in x occur at t = atan2(-ry*sin(phi), rx*cos(phi)) + n*pi
  // Extrema in y occur at t = atan2(ry*cos(phi), rx*sin(phi)) + n*pi

  const angleInSweep = (angle: number): boolean => {
    // Normalize angle relative to theta1
    let a = angle - theta1;
    // Normalize to [0, 2pi) or (-2pi, 0]
    if (dtheta > 0) {
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return a <= dtheta + 1e-10;
    } else {
      a = ((a % (2 * Math.PI)) - 2 * Math.PI) % (2 * Math.PI);
      return a >= dtheta - 1e-10;
    }
  };

  const evalPoint = (t: number): [number, number] => {
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    return [
      cx + cosPhi * rx * cosT - sinPhi * ry * sinT,
      cy + sinPhi * rx * cosT + cosPhi * ry * sinT,
    ];
  };

  // X extrema angles
  const txBase = Math.atan2(-ry * sinPhi, rx * cosPhi);
  // Y extrema angles
  const tyBase = Math.atan2(ry * cosPhi, rx * sinPhi);

  for (const base of [txBase, tyBase]) {
    for (let n = -2; n <= 2; n++) {
      const angle = base + n * Math.PI;
      if (angleInSweep(angle)) {
        const [px, py] = evalPoint(angle);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Parse SVG path data to extract tight bounding box.
 * Computes actual curve bounds by finding extrema, not just control points.
 */
function parseSvgPathBbox(d: string): BBox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let currentX = 0,
    currentY = 0;
  let startX = 0,
    startY = 0; // For Z command
  let lastControlX = 0,
    lastControlY = 0; // For smooth curves
  let prevCmd = "";

  const updateBounds = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const updateBoundsFromBbox = (bbox: BBox) => {
    minX = Math.min(minX, bbox[0]);
    minY = Math.min(minY, bbox[1]);
    maxX = Math.max(maxX, bbox[2]);
    maxY = Math.max(maxY, bbox[3]);
  };

  // Match commands and their parameters
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi);
  if (!commands) return null;

  for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
    const cmd = commands[cmdIndex];
    const type = cmd[0];
    const upperType = type.toUpperCase();
    const isRelative = type !== type.toUpperCase();
    const prevUpper = prevCmd.toUpperCase();
    // Parse numbers properly - they can run together when separated by negative signs
    const argStr = cmd.slice(1).trim();
    const args = (argStr.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(parseFloat);

    switch (upperType) {
      case "M": // moveto
        for (let i = 0; i < args.length; i += 2) {
          const x = isRelative ? currentX + args[i] : args[i];
          const y = isRelative ? currentY + args[i + 1] : args[i + 1];
          updateBounds(x, y);
          currentX = x;
          currentY = y;
          if (i === 0) {
            startX = x;
            startY = y;
          }
        }
        break;

      case "L": // lineto
        for (let i = 0; i < args.length; i += 2) {
          const x = isRelative ? currentX + args[i] : args[i];
          const y = isRelative ? currentY + args[i + 1] : args[i + 1];
          updateBounds(x, y);
          currentX = x;
          currentY = y;
        }
        break;

      case "H": // horizontal lineto
        for (const arg of args) {
          const x = isRelative ? currentX + arg : arg;
          updateBounds(x, currentY);
          currentX = x;
        }
        break;

      case "V": // vertical lineto
        for (const arg of args) {
          const y = isRelative ? currentY + arg : arg;
          updateBounds(currentX, y);
          currentY = y;
        }
        break;

      case "C": // cubic bezier
        for (let i = 0; i < args.length; i += 6) {
          const x1 = isRelative ? currentX + args[i] : args[i];
          const y1 = isRelative ? currentY + args[i + 1] : args[i + 1];
          const x2 = isRelative ? currentX + args[i + 2] : args[i + 2];
          const y2 = isRelative ? currentY + args[i + 3] : args[i + 3];
          const x = isRelative ? currentX + args[i + 4] : args[i + 4];
          const y = isRelative ? currentY + args[i + 5] : args[i + 5];

          const bbox = cubicBezierBounds(currentX, currentY, x1, y1, x2, y2, x, y);
          updateBoundsFromBbox(bbox);

          lastControlX = x2;
          lastControlY = y2;
          currentX = x;
          currentY = y;
        }
        break;

      case "S": // smooth cubic bezier
        for (let i = 0; i < args.length; i += 4) {
          // Reflect previous cubic control point only when previous segment was cubic.
          const shouldReflect = i > 0 || prevUpper === "C" || prevUpper === "S";
          const x1 = shouldReflect ? 2 * currentX - lastControlX : currentX;
          const y1 = shouldReflect ? 2 * currentY - lastControlY : currentY;
          const x2 = isRelative ? currentX + args[i] : args[i];
          const y2 = isRelative ? currentY + args[i + 1] : args[i + 1];
          const x = isRelative ? currentX + args[i + 2] : args[i + 2];
          const y = isRelative ? currentY + args[i + 3] : args[i + 3];

          const bbox = cubicBezierBounds(currentX, currentY, x1, y1, x2, y2, x, y);
          updateBoundsFromBbox(bbox);

          lastControlX = x2;
          lastControlY = y2;
          currentX = x;
          currentY = y;
        }
        break;

      case "Q": // quadratic bezier
        for (let i = 0; i < args.length; i += 4) {
          const x1 = isRelative ? currentX + args[i] : args[i];
          const y1 = isRelative ? currentY + args[i + 1] : args[i + 1];
          const x = isRelative ? currentX + args[i + 2] : args[i + 2];
          const y = isRelative ? currentY + args[i + 3] : args[i + 3];

          const bbox = quadraticBezierBounds(currentX, currentY, x1, y1, x, y);
          updateBoundsFromBbox(bbox);

          lastControlX = x1;
          lastControlY = y1;
          currentX = x;
          currentY = y;
        }
        break;

      case "T": // smooth quadratic bezier
        for (let i = 0; i < args.length; i += 2) {
          // Reflect previous quadratic control point only when previous segment was quadratic.
          const shouldReflect = i > 0 || prevUpper === "Q" || prevUpper === "T";
          const x1 = shouldReflect ? 2 * currentX - lastControlX : currentX;
          const y1 = shouldReflect ? 2 * currentY - lastControlY : currentY;
          const x = isRelative ? currentX + args[i] : args[i];
          const y = isRelative ? currentY + args[i + 1] : args[i + 1];

          const bbox = quadraticBezierBounds(currentX, currentY, x1, y1, x, y);
          updateBoundsFromBbox(bbox);

          lastControlX = x1;
          lastControlY = y1;
          currentX = x;
          currentY = y;
        }
        break;

      case "A": // arc
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          const rotation = args[i + 2];
          const largeArc = args[i + 3];
          const sweep = args[i + 4];
          const x = isRelative ? currentX + args[i + 5] : args[i + 5];
          const y = isRelative ? currentY + args[i + 6] : args[i + 6];

          const bbox = arcBounds(currentX, currentY, rx, ry, rotation, largeArc, sweep, x, y);
          updateBoundsFromBbox(bbox);

          currentX = x;
          currentY = y;
        }
        break;

      case "Z": // closepath
        currentX = startX;
        currentY = startY;
        break;
    }

    prevCmd = upperType;
  }

  if (minX === Infinity) return null;
  return [minX, minY, maxX, maxY];
}

/**
 * Parse SVG transform="matrix(a,b,c,d,e,f)" and apply to a bounding box.
 * Returns the transformed bbox.
 */
function applyMatrixTransformToBbox(
  bbox: BBox,
  transformAttr: string | null
): BBox {
  if (!transformAttr) return bbox;

  // Parse matrix(a,b,c,d,e,f)
  const matrixMatch = /matrix\(([^)]+)\)/.exec(transformAttr);
  if (!matrixMatch) return bbox;

  const values = matrixMatch[1].split(/[\s,]+/).map(parseFloat);
  if (values.length !== 6) return bbox;

  const [a, b, c, d, e, f] = values;
  const [minX, minY, maxX, maxY] = bbox;

  // Transform all 4 corners
  const corners = [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ];

  const transformed = corners.map(([x, y]) => [
    a * x + c * y + e,
    b * x + d * y + f,
  ]);

  // Find new bounds
  const xs = transformed.map((p) => p[0]);
  const ys = transformed.map((p) => p[1]);

  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
}

/**
 * Half the rendered stroke width of an SVG element, in page points — i.e.
 * how far the stroke ink extends beyond the path geometry on each side.
 *
 * `ShapeInfo.bbox` is the path *geometry* bbox; a stroke straddles the path
 * centreline and reaches `stroke-width / 2` past the geometry, so cropping a
 * figure to the geometry bbox shaves the outer half of its outline off (the
 * speech-bubble outline-clipping reported on PR #285). Returns 0 for
 * fill-only shapes so their bbox stays tight.
 *
 * stroke-width is authored in the element's pre-transform user units; the
 * `transform="matrix(a b c d e f)"` scales it into page space. We take the
 * larger axis scale so a non-uniform transform never under-expands.
 *
 * Miter joins can spike past `stroke-width / 2` (up to
 * `stroke-miterlimit × half`). We apply that factor only when the element
 * *explicitly* declares `stroke-linejoin="miter"`: mupdf emits the join
 * explicitly, and assuming the SVG default (miter) for elements that omit it
 * would balloon every round-joined bubble. Document-derived throughout — no
 * arbitrary bleed.
 */
function parseStrokeInkExtent(svgElement: string): number {
  const stroke = /\sstroke="([^"]*)"/.exec(svgElement)?.[1]?.trim();
  if (!stroke || stroke === "none" || stroke === "transparent") return 0;

  const widthRaw = /\sstroke-width="([^"]*)"/.exec(svgElement)?.[1];
  // SVG default stroke-width is 1 when a stroke is set but width omitted.
  const strokeWidth = widthRaw != null ? parseFloat(widthRaw) : 1;
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return 0;

  let scale = 1;
  const matrix = /matrix\(([^)]+)\)/.exec(svgElement)?.[1];
  if (matrix) {
    const v = matrix.split(/[\s,]+/).map(parseFloat);
    if (v.length === 6 && v.every(Number.isFinite)) {
      const [a, b, c, d] = v;
      scale = Math.max(Math.hypot(a, b), Math.hypot(c, d)) || 1;
    }
  }

  let half = (strokeWidth * scale) / 2;

  const linejoin = /\sstroke-linejoin="([^"]*)"/.exec(svgElement)?.[1];
  if (linejoin === "miter") {
    const mlRaw = /\sstroke-miterlimit="([^"]*)"/.exec(svgElement)?.[1];
    const miterLimit = mlRaw != null ? parseFloat(mlRaw) : 4; // SVG default
    if (Number.isFinite(miterLimit) && miterLimit > 1) half *= miterLimit;
  }

  return half;
}

/**
 * Extract shapes from SVG content.
 * Returns array of shapes with their bounding boxes (after applying transforms).
 * Tracks clip-path associations from parent <g> elements (including nested clips).
 */
function extractShapesFromSvg(svgContent: string): ShapeInfo[] {
  const shapes: ShapeInfo[] = [];
  let seqno = 0;

  // Remove <defs>...</defs> section for shape extraction (but we'll use it for clips later)
  // Note: <use> elements (font glyphs/text) are intentionally excluded - text is captured via toStructuredText()
  const contentWithoutDefs = svgContent.replace(/<defs>[\s\S]*?<\/defs>/gi, "");

  // Track clip group boundaries (start and end positions)
  // For nested clips, a shape can be inside multiple clip groups
  interface ClipRange { clipId: string; start: number; end: number; }
  const clipRanges: ClipRange[] = [];

  // Find clip groups by matching opening tags and tracking nesting
  const clipOpenRegex = /<g[^>]*clip-path="url\(#([^"]+)\)"[^>]*>/gi;
  let openMatch;
  while ((openMatch = clipOpenRegex.exec(contentWithoutDefs)) !== null) {
    const clipId = openMatch[1];
    const start = openMatch.index;

    // Find the matching closing </g> by counting nesting depth
    let depth = 1;
    let pos = start + openMatch[0].length;
    while (depth > 0 && pos < contentWithoutDefs.length) {
      if (contentWithoutDefs.slice(pos, pos + 2) === "<g") {
        depth++;
        pos += 2;
      } else if (contentWithoutDefs.slice(pos, pos + 4) === "</g>") {
        depth--;
        if (depth > 0) pos += 4;
      } else {
        pos++;
      }
    }
    const end = pos + 4; // include </g>

    clipRanges.push({ clipId, start, end });
  }

  // Helper to find ALL clipIds for a position (handles nested clips)
  const getClipIdsForPosition = (pos: number): string[] => {
    const clips: string[] = [];
    for (const range of clipRanges) {
      if (pos > range.start && pos < range.end) {
        clips.push(range.clipId);
      }
    }
    return clips;
  };

  // Extract path elements with full element string
  const pathRegex = /<path[^>]*>/gi;
  let match;
  while ((match = pathRegex.exec(contentWithoutDefs)) !== null) {
    const fullElement = match[0];
    const dMatch = /\sd="([^"]+)"/.exec(fullElement);
    if (!dMatch) continue;

    const d = dMatch[1];
    const originalBbox = parseSvgPathBbox(d);
    if (!originalBbox || originalBbox[2] <= originalBbox[0] || originalBbox[3] <= originalBbox[1]) continue;

    // Apply transform to get actual rendered position
    const transformMatch = /\stransform="([^"]+)"/.exec(fullElement);
    const bbox = applyMatrixTransformToBbox(originalBbox, transformMatch?.[1] ?? null);

    if (bbox[2] > bbox[0] && bbox[3] > bbox[1]) {
      // Find all clip-paths from parent groups (handles nested clips)
      const clipPathIds = getClipIdsForPosition(match.index);
      shapes.push({ bbox, originalBbox, seqno: seqno++, svgElement: fullElement, clipPathIds });
    }
  }

  // Extract rect elements with full element string
  const rectRegex = /<rect[^>]*>/gi;
  while ((match = rectRegex.exec(contentWithoutDefs)) !== null) {
    const fullElement = match[0];
    const xMatch = /\sx="([^"]+)"/.exec(fullElement);
    const yMatch = /\sy="([^"]+)"/.exec(fullElement);
    const wMatch = /\swidth="([^"]+)"/.exec(fullElement);
    const hMatch = /\sheight="([^"]+)"/.exec(fullElement);

    if (xMatch && yMatch && wMatch && hMatch) {
      const x = parseFloat(xMatch[1]);
      const y = parseFloat(yMatch[1]);
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);

      if (w > 0 && h > 0) {
        const originalBbox: BBox = [x, y, x + w, y + h];

        // Apply transform to get actual rendered position
        const transformMatch = /\stransform="([^"]+)"/.exec(fullElement);
        const bbox = applyMatrixTransformToBbox(originalBbox, transformMatch?.[1] ?? null);

        // Check for duplicates
        const exists = shapes.some(
          (s) =>
            Math.abs(s.bbox[0] - bbox[0]) < 0.1 &&
            Math.abs(s.bbox[1] - bbox[1]) < 0.1 &&
            Math.abs(s.bbox[2] - bbox[2]) < 0.1 &&
            Math.abs(s.bbox[3] - bbox[3]) < 0.1
        );
        if (!exists) {
          const clipPathIds = getClipIdsForPosition(match.index);
          shapes.push({ bbox, originalBbox, seqno: seqno++, svgElement: fullElement, clipPathIds });
        }
      }
    }
  }

  // Extract <image> elements (raster images embedded in SVG by mupdf)
  const imageRegex = /<image[^>]*>/gi;
  while ((match = imageRegex.exec(contentWithoutDefs)) !== null) {
    const fullElement = match[0];
    const xMatch = /\sx="([^"]+)"/.exec(fullElement);
    const yMatch = /\sy="([^"]+)"/.exec(fullElement);
    const wMatch = /\swidth="([^"]+)"/.exec(fullElement);
    const hMatch = /\sheight="([^"]+)"/.exec(fullElement);

    if (xMatch && yMatch && wMatch && hMatch) {
      const x = parseFloat(xMatch[1]);
      const y = parseFloat(yMatch[1]);
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);

      if (w > 0 && h > 0) {
        const originalBbox: BBox = [x, y, x + w, y + h];

        const transformMatch = /\stransform="([^"]+)"/.exec(fullElement);
        const bbox = applyMatrixTransformToBbox(originalBbox, transformMatch?.[1] ?? null);

        // Extract data URI and compute hash for dedup with raster extraction
        let imageDataHash: string | undefined;
        const hrefMatch = /\s(?:xlink:)?href="data:[^;]+;base64,([^"]+)"/.exec(fullElement);
        if (hrefMatch) {
          try {
            const buf = Buffer.from(hrefMatch[1], "base64");
            imageDataHash = hashBuffer(buf);
          } catch {
            // Ignore decode failures
          }
        }

        const clipPathIds = getClipIdsForPosition(match.index);
        shapes.push({
          bbox,
          originalBbox,
          seqno: seqno++,
          svgElement: fullElement,
          clipPathIds,
          isImage: true,
          imageDataHash,
        });
      }
    }
  }

  return shapes;
}

/**
 * Check if two bounding boxes overlap.
 */
function boxesOverlap(box1: BBox, box2: BBox, margin: number = 0): boolean {
  const [minX1, minY1, maxX1, maxY1] = box1;
  const [minX2, minY2, maxX2, maxY2] = box2;

  return !(
    maxX1 + margin < minX2 ||
    maxX2 + margin < minX1 ||
    maxY1 + margin < minY2 ||
    maxY2 + margin < minY1
  );
}

/**
 * Group overlapping shapes using union-find algorithm.
 */
function groupOverlappingShapes(
  shapes: ShapeInfo[],
  margin: number
): ShapeInfo[][] {
  const n = shapes.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (x: number, y: number): void => {
    const xRoot = find(x);
    const yRoot = find(y);
    if (xRoot !== yRoot) {
      parent[yRoot] = xRoot;
    }
  };

  // Max character count for a text line to be treated as a figure label.
  // Short text (labels like "3 km", "120°", "A") gets the expanded margin.
  // Long text (sentences/paragraphs) only groups with the standard margin,
  // preventing body text near figures from being pulled into the crop.
  const LABEL_MAX_CHARS = 20;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const iText = shapes[i].isText;
      const jText = shapes[j].isText;

      let m = margin;
      if (iText !== jText) {
        // Text-to-shape: use expanded margin only if the text is short (a label)
        const textShape = iText ? shapes[i] : shapes[j];
        m = (textShape.textLength ?? 0) <= LABEL_MAX_CHARS
          ? TEXT_OVERLAP_MARGIN
          : margin;
      }
      // Text-to-text: standard margin to avoid chaining paragraphs

      if (boxesOverlap(shapes[i].bbox, shapes[j].bbox, m)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, ShapeInfo[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(shapes[i]);
  }

  return Array.from(groups.values()).map((group) =>
    group.sort((a, b) => a.seqno - b.seqno)
  );
}

/**
 * Compute the combined bounding box of a group of shapes.
 */
function computeGroupBbox(group: ShapeInfo[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const shape of group) {
    const [x0, y0, x1, y1] = shape.bbox;
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Group bbox grown to the figure's true *ink* extent: each shape's geometry
 * bbox expanded by its own rendered stroke half-width (see
 * {@link parseStrokeInkExtent}) plus a one-device-pixel anti-alias guard.
 *
 * `computeGroupBbox` returns the geometry union, which crops strokes and the
 * rasteriser's 1px anti-alias fringe (the grey edge pixel visible one row in
 * from a "clipped" outline). `aaGuardX/Y` are 1 device pixel expressed in
 * page points (`1 / pageScale`) — measured from the page render, not an
 * arbitrary constant.
 */
function computeGroupInkBbox(
  group: ShapeInfo[],
  aaGuardX: number,
  aaGuardY: number,
): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const shape of group) {
    const stroke = parseStrokeInkExtent(shape.svgElement);
    const padX = stroke + aaGuardX;
    const padY = stroke + aaGuardY;
    const [x0, y0, x1, y1] = shape.bbox;
    minX = Math.min(minX, x0 - padX);
    minY = Math.min(minY, y0 - padY);
    maxX = Math.max(maxX, x1 + padX);
    maxY = Math.max(maxY, y1 + padY);
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Second-pass merge: combine small aligned groups that form a row or column.
 * E.g., a row of calculator buttons that are individually too small to extract
 * but together form a meaningful figure.
 *
 * Two groups merge when:
 *  - At least one is "small" (both dimensions < ROW_MERGE_MAX_DIMENSION)
 *  - They are aligned (significant overlap in one axis)
 *  - The gap along the other axis is < ROW_MERGE_GAP
 */
function mergeAlignedGroups(groups: ShapeInfo[][]): ShapeInfo[][] {
  if (groups.length <= 1) return groups;

  const bboxes = groups.map(g => computeGroupBbox(g));
  const n = groups.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (x: number, y: number): void => {
    const xr = find(x);
    const yr = find(y);
    if (xr !== yr) parent[yr] = xr;
  };

  for (let i = 0; i < n; i++) {
    const [ax0, ay0, ax1, ay1] = bboxes[i];
    const aw = ax1 - ax0;
    const ah = ay1 - ay0;
    const aSmall = aw < ROW_MERGE_MAX_DIMENSION && ah < ROW_MERGE_MAX_DIMENSION;

    for (let j = i + 1; j < n; j++) {
      const [bx0, by0, bx1, by1] = bboxes[j];
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      const bSmall = bw < ROW_MERGE_MAX_DIMENSION && bh < ROW_MERGE_MAX_DIMENSION;

      // At least one group must be small
      if (!aSmall && !bSmall) continue;

      // Horizontal alignment: y-ranges overlap by at least 50% of the shorter height
      const yOverlap = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
      const minH = Math.min(ah, bh);
      const horizontallyAligned = minH > 0 && yOverlap / minH >= 0.5;

      // Vertical alignment: x-ranges overlap by at least 50% of the shorter width
      const xOverlap = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
      const minW = Math.min(aw, bw);
      const verticallyAligned = minW > 0 && xOverlap / minW >= 0.5;

      if (horizontallyAligned) {
        // Gap along x-axis
        const xGap = Math.max(0, Math.max(ax0, bx0) - Math.min(ax1, bx1));
        if (xGap <= ROW_MERGE_GAP) union(i, j);
      } else if (verticallyAligned) {
        // Gap along y-axis
        const yGap = Math.max(0, Math.max(ay0, by0) - Math.min(ay1, by1));
        if (yGap <= ROW_MERGE_GAP) union(i, j);
      }
    }
  }

  const merged = new Map<number, ShapeInfo[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...groups[i]);
  }

  return Array.from(merged.values()).map(g => g.sort((a, b) => a.seqno - b.seqno));
}

/**
 * Extract text line bounding boxes from structured text as ShapeInfo entries.
 * These participate in Union-Find grouping so text labels near figures
 * are naturally included in figure groups.
 */
function extractTextShapes(
  stext: ReturnType<ReturnType<MupdfDocument["loadPage"]>["toStructuredText"]>,
  startSeqno: number,
  pageWidth: number,
): ShapeInfo[] {
  const shapes: ShapeInfo[] = [];
  let seqno = startSeqno;
  let currentBbox: BBox | null = null;
  let charCount = 0;
  const maxTextWidth = pageWidth * TEXT_MAX_WIDTH_RATIO;

  stext.walk({
    beginLine(bbox: [number, number, number, number]) {
      currentBbox = [bbox[0], bbox[1], bbox[2], bbox[3]];
      charCount = 0;
    },
    onChar(c: string) {
      if (c.trim().length > 0) charCount++;
    },
    endLine() {
      if (currentBbox && charCount > 0) {
        const [x0, y0, x1, y1] = currentBbox;
        const lineWidth = x1 - x0;
        // Skip wide text lines — they're body paragraphs, not figure labels.
        // Figure annotations (labels, dimensions) are short and localized.
        if (x1 > x0 && y1 > y0 && lineWidth <= maxTextWidth) {
          shapes.push({
            bbox: currentBbox,
            originalBbox: currentBbox,
            seqno: seqno++,
            svgElement: "",
            clipPathIds: [],
            isText: true,
            textLength: charCount,
          });
        }
      }
      currentBbox = null;
      charCount = 0;
    },
  });

  return shapes;
}

/**
 * Convert a PDF page to SVG using mupdf DocumentWriter.
 * Returns SVG content, defs section, and page dimensions.
 */
function getPageSvg(
  page: ReturnType<MupdfDocument["loadPage"]>
): PageSvgData {
  try {
    // Use DocumentWriter to render page as SVG
    const buf = new mupdf.Buffer();
    const writer = new mupdf.DocumentWriter(buf, "svg", "");

    const mediabox = page.getBounds();
    const device = writer.beginPage(mediabox);
    try {
      page.run(device, mupdf.Matrix.identity);
    } finally {
      // mupdf C requires close + drop on the per-page device before
      // ending the page; otherwise it logs "dropping unclosed device"
      // when the FinalizationRegistry eventually drops the WASM pointer.
      device.close();
      device.destroy();
    }
    writer.endPage();
    writer.close();
    writer.destroy();

    const svgContent = buf.asString();
    const pageWidth = mediabox[2] - mediabox[0];
    const pageHeight = mediabox[3] - mediabox[1];

    // Extract <defs> section (contains clipPath and mask definitions)
    const defsMatch = /<defs>([\s\S]*?)<\/defs>/i.exec(svgContent);
    const svgDefs = defsMatch ? defsMatch[1] : "";
    const contentWithoutDefs = svgContent.replace(/<defs>[\s\S]*?<\/defs>/gi, "");

    return { svgContent, contentWithoutDefs, svgDefs, pageWidth, pageHeight };
  } catch {
    return { svgContent: "", contentWithoutDefs: "", svgDefs: "", pageWidth: 0, pageHeight: 0 };
  }
}

/**
 * Parse clip path bounds from a clipPath element's content.
 * Applies any transform on the path/rect element inside the clipPath.
 * Returns bounds if parseable, null otherwise.
 */
function parseClipPathBounds(clipContent: string): BBox | null {
  let bbox: BBox | null = null;
  let transformAttr: string | null = null;

  // Try to extract path d attribute and its transform
  const pathMatch = /<path[^>]*>/.exec(clipContent);
  if (pathMatch) {
    const pathElement = pathMatch[0];
    const dMatch = /d="([^"]+)"/.exec(pathElement);
    if (dMatch) {
      bbox = parseSvgPathBbox(dMatch[1]);
    }
    const tMatch = /transform="([^"]+)"/.exec(pathElement);
    if (tMatch) {
      transformAttr = tMatch[1];
    }
  }

  // Try to extract rect if no path found
  if (!bbox) {
    const rectMatch = /<rect[^>]*>/.exec(clipContent);
    if (rectMatch) {
      const rectElement = rectMatch[0];
      const xMatch = /\sx="([^"]+)"/.exec(rectElement);
      const yMatch = /\sy="([^"]+)"/.exec(rectElement);
      const wMatch = /\swidth="([^"]+)"/.exec(rectElement);
      const hMatch = /\sheight="([^"]+)"/.exec(rectElement);
      if (xMatch && yMatch && wMatch && hMatch) {
        const x = parseFloat(xMatch[1]);
        const y = parseFloat(yMatch[1]);
        const w = parseFloat(wMatch[1]);
        const h = parseFloat(hMatch[1]);
        bbox = [x, y, x + w, y + h];
      }
      const tMatch = /transform="([^"]+)"/.exec(rectElement);
      if (tMatch) {
        transformAttr = tMatch[1];
      }
    }
  }

  if (!bbox) return null;

  // Apply transform if present
  if (transformAttr) {
    bbox = applyMatrixTransformToBbox(bbox, transformAttr);
  }

  return bbox;
}

/**
 * Check if a clip-path is a "page-level" clip that doesn't meaningfully clip content.
 * A clip is page-level if it covers most of the visible page area.
 * Clips positioned mostly outside the page (like clip_8) are NOT page-level.
 */
function isPageLevelClip(clipBounds: BBox | null, pageWidth: number, pageHeight: number): boolean {
  if (!clipBounds) return false;

  const [clipMinX, clipMinY, clipMaxX, clipMaxY] = clipBounds;

  // Calculate the intersection of clip with the page bounds [0, 0, pageWidth, pageHeight]
  const intersectMinX = Math.max(0, clipMinX);
  const intersectMinY = Math.max(0, clipMinY);
  const intersectMaxX = Math.min(pageWidth, clipMaxX);
  const intersectMaxY = Math.min(pageHeight, clipMaxY);

  // If clip doesn't intersect the page, it's not page-level (it clips everything)
  if (intersectMaxX <= intersectMinX || intersectMaxY <= intersectMinY) {
    return false;
  }

  const intersectWidth = intersectMaxX - intersectMinX;
  const intersectHeight = intersectMaxY - intersectMinY;

  // Clip is page-level if its intersection with the page covers >90% of page dimensions
  return intersectWidth > pageWidth * 0.9 && intersectHeight > pageHeight * 0.9;
}

/**
 * Render a group of shapes as a single PNG image.
 * Respects clip-paths by including relevant clipPath definitions.
 * Skips page-level clips that don't meaningfully clip content.
 */
async function renderShapeGroup(
  shapes: ShapeInfo[],
  pageId: string,
  imgIndex: number,
  svgDefs: string,
  pageWidth: number,
  pageHeight: number,
  precomputedBbox?: BBox
): Promise<ExtractedImage | null> {
  if (shapes.length === 0) return null;

  const bbox = precomputedBbox ?? computeGroupBbox(shapes);
  const [minX, minY, maxX, maxY] = bbox;
  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) return null;

  // Collect unique clipPath IDs used by shapes in this group
  const clipIds = new Set<string>();
  for (const s of shapes) {
    for (const clipId of s.clipPathIds) {
      clipIds.add(clipId);
    }
  }

  // Track which clips are actually applied (not page-level)
  const appliedClipIds = new Set<string>();

  // Extract clipPath definitions - keep them in original page coordinates
  // Only skip page-level clips when they're the ONLY clip (multiple clips intersect meaningfully)
  let neededDefs = "";
  if (clipIds.size > 0 && svgDefs) {
    const clipDefs: string[] = [];
    const pageLevelClipIds = new Set<string>();

    // First pass: identify page-level clips and extract their definitions
    const clipMatches = new Map<string, RegExpExecArray>();
    for (const clipId of clipIds) {
      const clipRegex = new RegExp(`<clipPath([^>]*)id="${clipId}"([^>]*)>([\\s\\S]*?)</clipPath>`, "i");
      const match = clipRegex.exec(svgDefs);
      if (match) {
        clipMatches.set(clipId, match);
        const clipContent = match[3];
        const clipBounds = parseClipPathBounds(clipContent);
        if (isPageLevelClip(clipBounds, pageWidth, pageHeight)) {
          pageLevelClipIds.add(clipId);
        }
      }
    }

    // Include all clips if there are multiple (intersection matters)
    // Only skip page-level clips when they're the only clip
    const shouldIncludePageLevel = clipIds.size > 1 || pageLevelClipIds.size === 0;

    for (const [clipId, match] of clipMatches) {
      if (pageLevelClipIds.has(clipId) && !shouldIncludePageLevel) {
        // Skip page-level clips when they're the only clip
        continue;
      }
      clipDefs.push(match[0]);
      appliedClipIds.add(clipId);
    }

    if (clipDefs.length > 0) {
      neededDefs = `<defs>${clipDefs.join("\n")}</defs>`;
    }
  }

  // Create SVG with shapes in page coordinates
  // Use viewBox to crop to the group's bounding box
  // Both shapes and clips are in the same page coordinate system
  // Wrap each shape in its applicable clips
  const shapeElements = shapes.map((s) => {
    const shapeClips = s.clipPathIds.filter(id => appliedClipIds.has(id));
    if (shapeClips.length === 0) {
      return s.svgElement;
    }
    // Wrap in nested clip groups (innermost first)
    let wrapped = s.svgElement;
    for (const clipId of shapeClips) {
      wrapped = `<g clip-path="url(#${clipId})">${wrapped}</g>`;
    }
    return wrapped;
  }).join("\n");

  // viewBox defines the visible region in page coordinates - this is the crop
  const shapeSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${width} ${height}">
${neededDefs}
${shapeElements}
</svg>`;

  try {
    // Render to PNG with transparency (144 DPI = 2x scale)
    const rawPng = await renderSvgToPng(shapeSvg);
    if (isFullyTransparent(rawPng)) return null;
    const pngBuf = autoCropPng(rawPng);

    const imgId = pageId + "_im" + String(imgIndex).padStart(3, "0");

    return {
      imageId: imgId,
      pageId,
      buffer: pngBuf,
      format: "png" as const,
      width: pngBuf.readUInt32BE(16),
      height: pngBuf.readUInt32BE(20),
      hash: hashBuffer(pngBuf),
    };
  } catch (err) {
    console.warn(`[renderShapeGroup] Failed to render group ${imgIndex} on ${pageId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Crop a figure group from the full-page PNG render.
 * Converts the group bbox from PDF points to pixel coordinates (2x scale).
 */
function cropFigureFromPageRender(
  pagePngBuffer: Buffer,
  bbox: BBox,
  pageId: string,
  imgIndex: number,
  pageWidth: number,
  pageHeight: number,
): ExtractedImage | null {
  const pageDims = pngDimensions(pagePngBuffer);
  const scaleX = pageDims.width / pageWidth;
  const scaleY = pageDims.height / pageHeight;

  // Convert bbox from PDF points to pixel coordinates
  const left = Math.max(0, Math.floor(bbox[0] * scaleX));
  const top = Math.max(0, Math.floor(bbox[1] * scaleY));
  const right = Math.min(pageDims.width, Math.ceil(bbox[2] * scaleX));
  const bottom = Math.min(pageDims.height, Math.ceil(bbox[3] * scaleY));
  const cropW = right - left;
  const cropH = bottom - top;

  if (cropW <= 0 || cropH <= 0) return null;

  try {
    const pngBuf = cropPng(pagePngBuffer, { left, top, width: cropW, height: cropH });
    const imgId = pageId + "_im" + String(imgIndex).padStart(3, "0");

    return {
      imageId: imgId,
      pageId,
      buffer: pngBuf,
      format: "png" as const,
      width: pngBuf.readUInt32BE(16),
      height: pngBuf.readUInt32BE(20),
      hash: hashBuffer(pngBuf),
    };
  } catch (err) {
    console.warn(`[cropFigureFromPageRender] Failed to crop figure ${imgIndex} on ${pageId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

interface FigureExtractionResult {
  images: ExtractedImage[];
  /** Hashes of raster images that are part of figure groups (for dedup with XObject extraction) */
  coveredRasterHashes: Set<string>;
  /**
   * Map from the hash of each SVG `<image>` element's decoded bytes to its
   * SVG source-order seqno. Used by callers to assign `streamSeqno` on
   * XObject-extracted rasters (matched by hash), yielding unified PDF
   * content-stream order across rasters + vectors.
   */
  imageHashToSeqno: Map<string, number>;
  /** Debug info about grouping and render decisions */
  debug: ExtractionDebugOutput;
}

async function extractVectorImagesFromSvg(
  svg: PageSvgData,
  pageId: string,
  startIndex: number,
  pagePngBuffer: Buffer,
  textShapes?: ShapeInfo[],
  /** Added to every produced image's `bounds.x` so right-page figures in a
   *  spread address the stitched viewport. Defaults to 0 (single page). */
  xOffset: number = 0,
): Promise<FigureExtractionResult> {
  const images: ExtractedImage[] = [];
  const coveredRasterHashes = new Set<string>();
  let imgIndex = startIndex;

  const { svgContent, pageWidth, pageHeight } = svg;
  const svgDefs = `<defs>${svg.svgDefs}</defs>`;

  // One device pixel of the page render expressed in page points
  // (`1 / pageScale`) — the rasteriser's anti-alias fringe. Feeds
  // computeGroupInkBbox so figure crops reach the figure's true ink extent
  // instead of shaving stroked outlines (PR #285 speech-bubble clipping).
  const pageDims = pngDimensions(pagePngBuffer);
  const aaGuardX = pageDims.width > 0 ? pageWidth / pageDims.width : 0;
  const aaGuardY = pageDims.height > 0 ? pageHeight / pageDims.height : 0;

  // Debug tracking
  const debug: ExtractionDebugOutput = {
    pageId,
    totalShapes: 0,
    totalTextShapes: 0,
    totalVectorShapes: 0,
    totalImageShapes: 0,
    backgroundsFiltered: 0,
    groupsBeforeMerge: 0,
    groupsAfterMerge: 0,
    textOnlyGroupsSkipped: 0,
    tooSmallGroupsSkipped: 0,
    groups: [],
  };

  // Extract shapes from SVG content (paths, rects, and image elements)
  const allShapes = extractShapesFromSvg(svgContent);
  const svgShapeCount = allShapes.length;

  // Include text line shapes so they participate in spatial grouping.
  // Wide text lines are already filtered out in extractTextShapes (TEXT_MAX_WIDTH_RATIO).
  let textShapesIncluded = 0;
  if (textShapes && textShapes.length > 0) {
    for (const ts of textShapes) {
      allShapes.push(ts);
      textShapesIncluded++;
    }
  }

  debug.totalShapes = allShapes.length;
  debug.totalTextShapes = textShapesIncluded;

  // Map each SVG image shape's hash to its seqno so callers can stamp
  // `streamSeqno` on the matching XObject-extracted rasters.
  const imageHashToSeqno = new Map<string, number>();
  for (const shape of allShapes) {
    if (shape.isImage && shape.imageDataHash) {
      imageHashToSeqno.set(shape.imageDataHash, shape.seqno);
    }
  }

  if (allShapes.length === 0) return { images, coveredRasterHashes, imageHashToSeqno, debug };

  // Split shapes into "normal" (participate in foreground grouping) and
  // "background" (large page-fill shapes >75% of page in either dim).
  // Backgrounds are kept aside because they'd merge unrelated foreground
  // groups during spatial grouping; they're emitted as standalone figures
  // at the end of this pass so fixed-layout rendering can render them below
  // the foreground.
  const bgWidthThreshold = pageWidth * BACKGROUND_THRESHOLD;
  const bgHeightThreshold = pageHeight * BACKGROUND_THRESHOLD;
  const normalShapes: ShapeInfo[] = [];
  const backgroundShapes: ShapeInfo[] = [];

  for (const shape of allShapes) {
    const [minX, minY, maxX, maxY] = shape.bbox;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) continue;
    if (w >= bgWidthThreshold || h >= bgHeightThreshold) {
      debug.backgroundsFiltered++;
      // Non-text backgrounds become their own figures; text blocks that
      // happen to be huge are discarded (would just be noise).
      if (!shape.isText) backgroundShapes.push(shape);
      continue;
    }
    normalShapes.push(shape);
  }

  // Count shape types after filtering (so totals are consistent)
  debug.totalTextShapes = 0;
  for (const s of normalShapes) {
    if (s.isText) debug.totalTextShapes++;
    else if (s.isImage) debug.totalImageShapes++;
    else debug.totalVectorShapes++;
  }
  debug.totalShapes = normalShapes.length;

  // Group overlapping normal shapes (vectors, images, and text lines)
  const initialGroups = groupOverlappingShapes(normalShapes, OVERLAP_MARGIN);
  debug.groupsBeforeMerge = initialGroups.length;

  // Second pass: merge small aligned groups that form rows/columns
  // (e.g., calculator buttons, icon sequences with gaps between them)
  const groups = mergeAlignedGroups(initialGroups);
  debug.groupsAfterMerge = groups.length;

  // Sort groups by vertical position (top of bbox) so images come out in reading order.
  groups.sort((a, b) => {
    const aBbox = computeGroupBbox(a);
    const bBbox = computeGroupBbox(b);
    return (aBbox[1] - bBbox[1]) || (aBbox[0] - bBbox[0]);
  });

  // Render each group as a single image, skipping groups too small to be meaningful.
  let groupIndex = 0;
  for (const group of groups) {
    groupIndex++;
    const bbox = computeGroupBbox(group);
    const groupW = bbox[2] - bbox[0];
    const groupH = bbox[3] - bbox[1];

    if (groupW < MIN_VECTOR_DIMENSION && groupH < MIN_VECTOR_DIMENSION) {
      debug.tooSmallGroupsSkipped++;
      continue;
    }

    const hasImages = group.some(s => s.isImage);
    const hasNonText = group.some(s => !s.isText);
    if (!hasNonText) {
      debug.textOnlyGroupsSkipped++;
      continue;
    }

    const hasText = group.some(s => s.isText);
    const nonTextShapes = group.filter(s => !s.isText);
    // Crop to the figure's true ink extent (geometry + per-shape stroke
    // half-width + 1px AA), clamped to the page. The small-figure skip above
    // intentionally stays on the geometry bbox so a stroke can't inflate a
    // sub-threshold speck past MIN_VECTOR_DIMENSION.
    const ink = computeGroupInkBbox(group, aaGuardX, aaGuardY);
    const cropBbox: BBox = [
      Math.max(0, ink[0]),
      Math.max(0, ink[1]),
      Math.min(pageWidth, ink[2]),
      Math.min(pageHeight, ink[3]),
    ];

    const cropW = cropBbox[2] - cropBbox[0];
    const cropH = cropBbox[3] - cropBbox[1];
    if (cropW < MIN_VECTOR_DIMENSION && cropH < MIN_VECTOR_DIMENSION) {
      debug.tooSmallGroupsSkipped++;
      continue;
    }

    imgIndex++;

    // Determine render method and reason
    let renderMethod: RenderMethod;
    let renderReason: string;
    if (hasImages && hasText) {
      renderMethod = "page-crop";
      renderReason = "group has raster images + text — page crop for correct compositing and text positioning";
    } else if (hasImages) {
      renderMethod = "page-crop";
      renderReason = "group has raster images — page crop to capture all layers";
    } else if (hasText) {
      renderMethod = "page-crop";
      renderReason = "group has text labels — page crop for correct text positioning";
    } else {
      renderMethod = "vector";
      renderReason = "pure vector group (no text, no raster) — SVG render for crisp output";
    }

    // Build per-shape debug info (cap at 50 shapes to keep output manageable)
    const shapesDebug: ShapeDebugInfo[] = group.slice(0, 50).map(s => ({
      type: s.isText ? "text" as const : s.isImage ? "image" as const : "vector" as const,
      bbox: s.bbox,
      ...(s.isText && s.textLength != null ? { textLength: s.textLength } : {}),
    }));

    const imageId = pageId + "_im" + String(imgIndex).padStart(3, "0");
    debug.groups.push({
      imageId,
      groupIndex,
      shapeCount: group.length,
      shapes: shapesDebug,
      groupBbox: cropBbox,
      hasImages,
      hasText,
      hasNonText,
      renderMethod,
      renderReason,
    });

    let img: ExtractedImage | null;

    if (hasImages || hasText) {
      img = cropFigureFromPageRender(pagePngBuffer, cropBbox, pageId, imgIndex, pageWidth, pageHeight);
      if (img) {
        img.renderMethod = "page-crop";
        for (const s of group) {
          if (s.isImage && s.imageDataHash) {
            coveredRasterHashes.add(s.imageDataHash);
          }
        }
      }
    } else {
      img = await renderShapeGroup(nonTextShapes, pageId, imgIndex, svgDefs, pageWidth, pageHeight, cropBbox);
      if (img) img.renderMethod = "vector";
    }

    if (img) {
      // Record the figure's page placement in PDF points (top-left origin).
      // Fixed-layout rendering reads these to position the figure on the page.
      img.bounds = {
        x: cropBbox[0] + xOffset,
        y: cropBbox[1],
        width: cropW,
        height: cropH,
      };
      // Fallback z-order: earliest SVG-document-order shape. mupdf's SVG
      // export order is NOT stream order, so this is unreliable on its own —
      // stampFigureSeqnosFromOps overrides it with the true content-stream
      // seqno by matching recorder path ops to the per-shape geometry boxes
      // below. The fallback only survives for groups with no matching path
      // op (e.g. pure raster/text page-crops).
      img.streamSeqno = Math.min(...group.map((s) => s.seqno));
      // Per-shape geometry bboxes in recorder space (page coords + spread
      // xOffset, matching `img.bounds.x`). Used for exact op→figure
      // identity instead of brittle aggregate bbox containment.
      img.shapeGeomBoxes = group.map((s): BBox => [
        s.bbox[0] + xOffset,
        s.bbox[1],
        s.bbox[2] + xOffset,
        s.bbox[3],
      ]);
      // Keep what's needed to re-render a surviving subset if some of this
      // figure's shapes are later excluded as text duplicates. Captured for
      // page-crop figures too: a decorative-letter bubble is page-crop only
      // because the invisible duplicate text joined the group; once those
      // shapes are excluded the survivors are pure vector and re-render
      // cleanly (no baked-in ghost glyph).
      figureRenderCtx.set(img, {
        group,
        svgDefs,
        pageWidth,
        pageHeight,
        xOffset,
        aaGuardX,
        aaGuardY,
        hadImages: hasImages,
      });
      images.push(img);
    }
  }

  // Emit each background shape as its own figure — they're large page-fill
  // shapes (purple sky, color-block strips) that got excluded from the
  // foreground grouping but still need to render.
  backgroundShapes.sort((a, b) => a.seqno - b.seqno);
  for (const shape of backgroundShapes) {
    imgIndex++;
    const bgBbox = shape.bbox;
    const bgW = bgBbox[2] - bgBbox[0];
    const bgH = bgBbox[3] - bgBbox[1];
    const img = await renderShapeGroup([shape], pageId, imgIndex, svgDefs, pageWidth, pageHeight, bgBbox);
    if (!img) continue;
    img.renderMethod = "vector";
    img.bounds = {
      x: bgBbox[0] + xOffset,
      y: bgBbox[1],
      width: bgW,
      height: bgH,
    };
    img.streamSeqno = shape.seqno; // SVG-order fallback; overridden below.
    img.shapeGeomBoxes = [[
      bgBbox[0] + xOffset,
      bgBbox[1],
      bgBbox[2] + xOffset,
      bgBbox[3],
    ]];
    images.push(img);
  }

  return { images, coveredRasterHashes, imageHashToSeqno, debug };
}

/**
 * Drop vector figure shapes that `restyleCoincidentVectorText` consumed
 * (their paint was folded into the duplicate selectable text run), so the
 * figure isn't double-rendered over the text it duplicates.
 *
 * - no shapes consumed → figure unchanged.
 * - all shapes consumed → figure dropped (e.g. colouring `im002`, the
 *   whole "white" outline).
 * - some consumed → re-render the surviving shapes only, preserving the
 *   figure's `imageId` (e.g. Volcanoes `im003`: keep the bubble, drop the
 *   hand-lettered glyphs). Re-render mirrors the original vector-figure
 *   build (same `computeGroupInkBbox` + page clamp + bounds/boxes).
 *
 * A figure shape is consumed when it sits inside an already-restyled
 * run's glyph box (the vector duplicate of that run). Coincidence uses a
 * ≥70%-of-shape-area overlap, not strict containment / op-bbox equality:
 * a hand-lettered glyph is one SVG shape but many recorder subpath ops
 * and may slightly overhang the font-metrics box, while a bubble outline
 * barely intersects a small letter run box so it's never wrongly flagged.
 * Figures whose survivors include a raster image (illustration panels)
 * are kept whole; re-rendering them vector-only would drop the art.
 */
async function excludeConsumedFigureShapes(
  figures: ExtractedImage[],
  restyledBoxes: BBox[],
): Promise<ExtractedImage[]> {
  if (restyledBoxes.length === 0) return figures;
  const MIN_INSIDE = 0.7;
  const boxConsumed = (b: BBox): boolean => {
    const area = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    if (area <= 0) return false;
    return restyledBoxes.some((r) => {
      const ix = Math.max(0, Math.min(b[2], r[2]) - Math.max(b[0], r[0]));
      const iy = Math.max(0, Math.min(b[3], r[3]) - Math.max(b[1], r[1]));
      return (ix * iy) / area >= MIN_INSIDE;
    });
  };

  const out: ExtractedImage[] = [];
  for (const fig of figures) {
    const boxes = fig.shapeGeomBoxes;
    if (!boxes || boxes.length === 0) {
      out.push(fig);
      continue;
    }
    const flags = boxes.map((b) => boxConsumed(b));
    const n = flags.filter(Boolean).length;
    if (n === 0) {
      out.push(fig);
      continue;
    }
    if (n === boxes.length) continue; // whole figure duplicates text → drop

    const ctx = figureRenderCtx.get(fig);
    if (!ctx) {
      out.push(fig); // no re-render context — keep whole (safe)
      continue;
    }
    // A figure built from a group that contained raster images is a crop
    // of the composited page render — its illustration can't be rebuilt
    // from the SVG shape subset, so re-rendering it vector-only destroys
    // the artwork. Keep such figures whole (conservative; an illustration
    // panel that also bakes a heading keeps a ghost — accepted). Only
    // raster-free figures (decorative-letter bubbles, true vector figures)
    // re-render cleanly.
    if (ctx.hadImages) {
      out.push(fig);
      continue;
    }
    const survivingGroup = ctx.group.filter((_, i) => !flags[i]);
    const survivingNonText = survivingGroup.filter((s) => !s.isText);
    if (survivingNonText.length === 0) continue;
    if (survivingNonText.some((s) => s.isImage)) {
      out.push(fig);
      continue;
    }

    const ink = computeGroupInkBbox(
      survivingGroup,
      ctx.aaGuardX,
      ctx.aaGuardY,
    );
    const cropBbox: BBox = [
      Math.max(0, ink[0]),
      Math.max(0, ink[1]),
      Math.min(ctx.pageWidth, ink[2]),
      Math.min(ctx.pageHeight, ink[3]),
    ];
    const re = await renderShapeGroup(
      survivingNonText,
      fig.pageId,
      0,
      ctx.svgDefs,
      ctx.pageWidth,
      ctx.pageHeight,
      cropBbox,
    );
    if (!re) continue;
    re.imageId = fig.imageId; // preserve id — downstream keys on it
    re.pageId = fig.pageId;
    re.renderMethod = "vector";
    re.bounds = {
      x: cropBbox[0] + ctx.xOffset,
      y: cropBbox[1],
      width: cropBbox[2] - cropBbox[0],
      height: cropBbox[3] - cropBbox[1],
    };
    // Fallback z-order; re-stamped from recorder ops after exclusion.
    re.streamSeqno = Math.min(...survivingGroup.map((s) => s.seqno));
    re.shapeGeomBoxes = survivingGroup.map((s): BBox => [
      s.bbox[0] + ctx.xOffset,
      s.bbox[1],
      s.bbox[2] + ctx.xOffset,
      s.bbox[3],
    ]);
    figureRenderCtx.set(re, { ...ctx, group: survivingGroup });
    out.push(re);
  }
  return out;
}

// ============================================================================
// Exports for testing
// ============================================================================

/**
 * Render the first page of a PDF as a PNG thumbnail.
 * Returns the PNG buffer, or null if rendering fails.
 */
export function renderPdfCover(
  pdfBuffer: Buffer,
  options?: { maxWidth?: number },
): Buffer | null {
  try {
    const doc = openPdfFromBuffer(pdfBuffer);
    try {
      const page = doc.loadPage(0);
      const bounds = page.getBounds();
      const pageWidth = bounds[2] - bounds[0];
      const scale = options?.maxWidth && pageWidth > options.maxWidth
        ? options.maxWidth / pageWidth
        : 1;
      const matrix = mupdf.Matrix.scale(scale, scale);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
      return Buffer.from(pixmap.asPNG());
    } finally {
      doc.destroy();
    }
  } catch {
    return null;
  }
}

/** @internal Exported for testing */
export const _testing = {
  parseSvgPathBbox,
  applyMatrixTransformToBbox,
  parseClipPathBounds,
  isPageLevelClip,
  parseStrokeInkExtent,
  computeGroupInkBbox,
  stampFigureSeqnosFromOps,
  restyleCoincidentVectorText,
};
