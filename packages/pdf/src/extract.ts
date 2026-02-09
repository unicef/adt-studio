/**
 * PDF Extraction Library
 *
 * Extracts pages, text, and images from PDF files using mupdf.
 */

import { createHash } from "crypto";
import mupdf, { type Document as MupdfDocument } from "mupdf";
import { renderSvgToPng } from "./svg-render.js";

// ============================================================================
// Types
// ============================================================================

export interface ExtractInput {
  /** PDF file contents as a Buffer */
  pdfBuffer: Buffer;
  /** Page range to extract (1-indexed, inclusive) */
  startPage?: number;
  endPage?: number;
}

export interface ExtractedPage {
  pageId: string;
  pageNumber: number;
  text: string;
  pageImage: ExtractedImage;
  images: ExtractedImage[];
}

export interface ExtractedImage {
  imageId: string;
  pageId: string;
  pngBuffer: Buffer;
  width: number;
  height: number;
  hash: string;
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

export interface ExtractProgress {
  page: number;
  totalPages: number;
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
  const { pdfBuffer, startPage = 1, endPage } = input;

  // Open PDF (suppressing mupdf stderr spam)
  const doc = openPdfFromBuffer(pdfBuffer);

  // Extract PDF metadata
  const pdfMetadata = extractPdfMetadata(doc);

  // Determine page range
  const totalPagesInPdf = doc.countPages();
  const start = startPage - 1; // Convert to 0-indexed
  const end = Math.min(endPage ?? totalPagesInPdf, totalPagesInPdf);
  const rangeSize = end - start;

  const pages: ExtractedPage[] = [];

  for (let i = start; i < end; i++) {
    const page = await extractPage(doc, i);
    pages.push(page);

    onProgress?.({
      page: i - start + 1,
      totalPages: rangeSize,
    });

    // Yield to event loop so progress streams can flush to clients.
    // (resvg-wasm renders synchronously, unlike sharp which used a worker thread)
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    pages,
    pdfMetadata,
    totalPagesInPdf,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
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

async function extractPage(doc: MupdfDocument, pageIndex: number): Promise<ExtractedPage> {
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
    pngBuffer: pagePngBuf,
    width: pagePngBuf.readUInt32BE(16),
    height: pagePngBuf.readUInt32BE(20),
    hash: hashBuffer(pagePngBuf),
  };

  // Extract text
  const stext = page.toStructuredText();
  const text = stext.asText();

  // Generate page SVG once for both raster and vector extraction
  const pageSvg = getPageSvg(page);

  // Extract raster images and vector graphics from SVG
  const rasterImages = await extractRasterImages(pageSvg, pageId);
  const vectorImages = await extractVectorImagesFromSvg(pageSvg, pageId, rasterImages.length);

  return {
    pageId,
    pageNumber: pageNum,
    text,
    pageImage,
    images: [...rasterImages, ...vectorImages],
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
 * Extract raster images from the SVG representation of a PDF page.
 * Renders <image> elements with their clip-paths and masks applied,
 * preserving transparency from both masks and clipping.
 */
async function extractRasterImages(
  svg: PageSvgData,
  pageId: string
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  const { contentWithoutDefs, svgDefs, pageWidth, pageHeight } = svg;

  // Find <image> elements
  const imageRegex = /<image[^>]*\/?>/gi;
  let match;
  let imgIndex = 0;

  while ((match = imageRegex.exec(contentWithoutDefs)) !== null) {
    const elem = match[0];

    // Get image dimensions
    const widthM = /\swidth="([^"]+)"/.exec(elem);
    const heightM = /\sheight="([^"]+)"/.exec(elem);
    if (!widthM || !heightM) continue;
    const imgW = parseFloat(widthM[1]);
    const imgH = parseFloat(heightM[1]);

    // Find all enclosing <g> groups using a stack parser
    const tagRegex = /<(\/?)g([^>]*)>/gi;
    const stack: string[] = [];
    let m;
    tagRegex.lastIndex = 0;
    while ((m = tagRegex.exec(contentWithoutDefs)) !== null) {
      if (m.index >= match.index) break;
      if (m[1] === "/") {
        stack.pop();
      } else {
        stack.push(m[0]);
      }
    }

    // Compute bbox by applying transforms from innermost to outermost
    let bbox: BBox = [0, 0, imgW, imgH];
    for (let i = stack.length - 1; i >= 0; i--) {
      const t = /transform="([^"]+)"/.exec(stack[i]);
      if (t) {
        bbox = applyMatrixTransformToBbox(bbox, t[1]);
      }
    }

    const [minX, minY, maxX, maxY] = bbox;
    const vbW = maxX - minX;
    const vbH = maxY - minY;
    if (vbW <= 0 || vbH <= 0) continue;

    // Collect clip-path and mask IDs from enclosing groups
    const clipIds: string[] = [];
    const maskIds: string[] = [];
    for (const group of stack) {
      const clipM = /clip-path="url\(#([^)]+)\)"/.exec(group);
      if (clipM) clipIds.push(clipM[1]);
      const maskM = /\smask="url\(#([^)]+)\)"/.exec(group);
      if (maskM) maskIds.push(maskM[1]);
    }

    // Determine which clips to include (skip page-level when alone)
    const appliedClipIds = new Set<string>();
    const pageLevelClipIds = new Set<string>();

    for (const clipId of clipIds) {
      const clipRegex = new RegExp(`<clipPath[^>]*id="${clipId}"[^>]*>[\\s\\S]*?</clipPath>`, "i");
      const cm = clipRegex.exec(svgDefs);
      if (cm) {
        const clipBounds = parseClipPathBounds(cm[0]);
        if (isPageLevelClip(clipBounds, pageWidth, pageHeight)) {
          pageLevelClipIds.add(clipId);
        }
      }
    }

    const shouldIncludePageLevel = clipIds.length > 1 || pageLevelClipIds.size === 0;

    // Build defs: clips + masks
    const defParts: string[] = [];

    for (const clipId of clipIds) {
      if (pageLevelClipIds.has(clipId) && !shouldIncludePageLevel) continue;
      const clipRegex = new RegExp(`<clipPath[^>]*id="${clipId}"[^>]*>[\\s\\S]*?</clipPath>`, "i");
      const cm = clipRegex.exec(svgDefs);
      if (cm) {
        defParts.push(cm[0]);
        appliedClipIds.add(clipId);
      }
    }

    for (const maskId of maskIds) {
      const maskRegex = new RegExp(`<mask[^>]*id="${maskId}"[^>]*>[\\s\\S]*?</mask>`, "i");
      const mm = maskRegex.exec(svgDefs);
      if (mm) defParts.push(mm[0]);
    }

    // Reconstruct group hierarchy around the image element
    // Only include groups with relevant attributes (transform, clip, mask)
    let imageContent = elem;
    for (let i = stack.length - 1; i >= 0; i--) {
      const group = stack[i];
      const hasTransform = /transform="/.test(group);
      const hasClip = /clip-path="url\(#([^)]+)\)"/.exec(group);
      const hasMask = /mask="url\(#([^)]+)\)"/.exec(group);

      // Skip clip groups for clips we're not including
      if (hasClip && !appliedClipIds.has(hasClip[1])) continue;

      if (hasTransform || hasClip || hasMask) {
        imageContent = group + imageContent + "</g>";
      }
    }

    const defsStr = defParts.length > 0 ? `<defs>${defParts.join("\n")}</defs>` : "";
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${vbW} ${vbH}">\n${defsStr}\n${imageContent}\n</svg>`;

    try {
      const pngBuf = await renderSvgToPng(svgStr);

      imgIndex++;
      const imgId = pageId + "_im" + String(imgIndex).padStart(3, "0");

      images.push({
        imageId: imgId,
        pageId,
        pngBuffer: pngBuf,
        width: pngBuf.readUInt32BE(16),
        height: pngBuf.readUInt32BE(20),
        hash: hashBuffer(pngBuf),
      });
    } catch (err) {
      console.warn(`[extractRasterImages] Failed to render image ${imgIndex + 1} on ${pageId}:`, err instanceof Error ? err.message : err);
    }
  }

  return images;
}

/**
 * Minimum dimension (in points) for a vector image to be extracted.
 * Filters out tiny decorative elements like bullets or icons.
 */
const MIN_VECTOR_DIMENSION = 25;

/**
 * Percentage of page dimension above which items are considered backgrounds.
 */
const OVERLAP_THRESHOLD_PERCENT = 0.75;

/**
 * Margin (in points) for overlap detection when grouping shapes.
 * Positive values allow shapes to be grouped if they're within this distance.
 */
const OVERLAP_MARGIN = 2;

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
}

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
 * Compute the exact bounding box of an elliptical arc.
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

  // Sample the arc at multiple points for a reasonable approximation
  const cos = Math.cos(rotation * Math.PI / 180);
  const sin = Math.sin(rotation * Math.PI / 180);
  const samples = 16;

  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const angle = t * Math.PI * (largeArc ? 2 : 1) * (sweep ? 1 : -1);
    const px = rx * Math.cos(angle);
    const py = ry * Math.sin(angle);
    // Rotate
    const x = x0 + (x1 - x0) * t + (cos * px - sin * py) * (1 - Math.abs(2 * t - 1));
    const y = y0 + (y1 - y0) * t + (sin * px + cos * py) * (1 - Math.abs(2 * t - 1));
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
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

  for (const cmd of commands) {
    const type = cmd[0];
    const isRelative = type !== type.toUpperCase();
    // Parse numbers properly - they can run together when separated by negative signs
    const argStr = cmd.slice(1).trim();
    const args = (argStr.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(parseFloat);

    switch (type.toUpperCase()) {
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
          // First control point is reflection of last control point
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
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
          // Control point is reflection of last control point
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
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

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Group shapes that overlap spatially - each shape keeps its own clips for rendering
      if (boxesOverlap(shapes[i].bbox, shapes[j].bbox, margin)) {
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
    page.run(device, mupdf.Matrix.identity);
    writer.endPage();
    writer.close();

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
    const pngBuf = await renderSvgToPng(shapeSvg);

    const imgId = pageId + "_im" + String(imgIndex).padStart(3, "0");

    return {
      imageId: imgId,
      pageId,
      pngBuffer: pngBuf,
      width: pngBuf.readUInt32BE(16),
      height: pngBuf.readUInt32BE(20),
      hash: hashBuffer(pngBuf),
    };
  } catch (err) {
    console.warn(`[renderShapeGroup] Failed to render group ${imgIndex} on ${pageId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function extractVectorImagesFromSvg(
  svg: PageSvgData,
  pageId: string,
  startIndex: number
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  let imgIndex = startIndex;

  const { svgContent, pageWidth, pageHeight } = svg;
  const svgDefs = `<defs>${svg.svgDefs}</defs>`;

  // Extract shapes from SVG content
  const allShapes = extractShapesFromSvg(svgContent);
  if (allShapes.length === 0) return images;

  // Skip background shapes - large in either dimension (>75% of page)
  // These are backgrounds/decorative elements that would merge unrelated groups
  const largeWidthThreshold = pageWidth * OVERLAP_THRESHOLD_PERCENT;
  const largeHeightThreshold = pageHeight * OVERLAP_THRESHOLD_PERCENT;

  const normalShapes: ShapeInfo[] = [];
  for (const shape of allShapes) {
    const [minX, minY, maxX, maxY] = shape.bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) continue;
    if (width >= largeWidthThreshold || height >= largeHeightThreshold) continue;
    normalShapes.push(shape);
  }

  // Group overlapping shapes
  const groups = groupOverlappingShapes(normalShapes, OVERLAP_MARGIN);

  // Render each group as a single image, skipping groups too small to be meaningful.
  // Uses && so thin shapes (e.g. tall narrow lines) still pass through — only skip
  // when both dimensions are below the threshold.
  for (const group of groups) {
    const bbox = computeGroupBbox(group);
    const groupW = bbox[2] - bbox[0];
    const groupH = bbox[3] - bbox[1];
    if (groupW < MIN_VECTOR_DIMENSION && groupH < MIN_VECTOR_DIMENSION) continue;

    imgIndex++;
    const img = await renderShapeGroup(group, pageId, imgIndex, svgDefs, pageWidth, pageHeight, bbox);
    if (img) images.push(img);
  }

  return images;
}

// ============================================================================
// Exports for testing
// ============================================================================

/** @internal Exported for testing */
export const _testing = {
  parseSvgPathBbox,
  applyMatrixTransformToBbox,
  parseClipPathBounds,
  isPageLevelClip,
};
