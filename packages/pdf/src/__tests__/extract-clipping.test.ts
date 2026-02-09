import { describe, it, expect } from "vitest";
import { getPngMetadata, decodePng } from "../png-utils.js";
import { extractPdf, _testing } from "../extract.js";
import { createTestPdf, createSmallGroupTestPdf } from "./create-test-pdf.js";

const {
  parseSvgPathBbox,
  applyMatrixTransformToBbox,
  parseClipPathBounds,
  isPageLevelClip,
  computeImageViewportBbox,
} = _testing;

describe("SVG Path Bbox Parsing", () => {
  it("parses simple M L path", () => {
    const bbox = parseSvgPathBbox("M10 20 L30 40");
    expect(bbox).toEqual([10, 20, 30, 40]);
  });

  it("parses path with H and V commands", () => {
    const bbox = parseSvgPathBbox("M10 20H50V60H10Z");
    expect(bbox).toEqual([10, 20, 50, 60]);
  });

  it("parses path with relative commands", () => {
    const bbox = parseSvgPathBbox("M10 20 l20 30");
    expect(bbox).toEqual([10, 20, 30, 50]);
  });

  it("parses path with cubic bezier", () => {
    const bbox = parseSvgPathBbox("M0 0 C10 20 30 40 50 50");
    expect(bbox).not.toBeNull();
    expect(bbox![0]).toBeLessThanOrEqual(0);
    expect(bbox![1]).toBeLessThanOrEqual(0);
    expect(bbox![2]).toBeGreaterThanOrEqual(50);
    expect(bbox![3]).toBeGreaterThanOrEqual(50);
  });

  it("parses path with negative numbers separated by minus sign", () => {
    const bbox = parseSvgPathBbox("M0 0 L.073-.195");
    expect(bbox).not.toBeNull();
    expect(bbox![2]).toBeCloseTo(0.073, 3);
    expect(bbox![3]).toBeCloseTo(0, 3);
  });

  it("returns null for empty path", () => {
    expect(parseSvgPathBbox("")).toBeNull();
  });

  it("returns null for invalid path", () => {
    expect(parseSvgPathBbox("not a path")).toBeNull();
  });

  it("handles S command after non-cubic command per SVG spec", () => {
    const bbox = parseSvgPathBbox("M500 500 S510 510 520 520");
    expect(bbox).toEqual([500, 500, 520, 520]);
  });

  it("handles T command after non-quadratic command per SVG spec", () => {
    const bbox = parseSvgPathBbox("M500 500 T520 520");
    expect(bbox).toEqual([500, 500, 520, 520]);
  });
});

describe("Matrix Transform Application", () => {
  it("applies identity transform", () => {
    const bbox: [number, number, number, number] = [10, 20, 30, 40];
    const result = applyMatrixTransformToBbox(bbox, "matrix(1,0,0,1,0,0)");
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it("applies translation transform", () => {
    const bbox: [number, number, number, number] = [0, 0, 10, 10];
    const result = applyMatrixTransformToBbox(bbox, "matrix(1,0,0,1,100,200)");
    expect(result).toEqual([100, 200, 110, 210]);
  });

  it("applies scale transform", () => {
    const bbox: [number, number, number, number] = [0, 0, 10, 10];
    const result = applyMatrixTransformToBbox(bbox, "matrix(2,0,0,2,0,0)");
    expect(result).toEqual([0, 0, 20, 20]);
  });

  it("applies Y-flip transform (common in PDF)", () => {
    const bbox: [number, number, number, number] = [0, 20, 10, 40];
    const result = applyMatrixTransformToBbox(bbox, "matrix(1,0,0,-1,0,100)");
    expect(result).toEqual([0, 60, 10, 80]);
  });

  it("returns original bbox for null transform", () => {
    const bbox: [number, number, number, number] = [10, 20, 30, 40];
    const result = applyMatrixTransformToBbox(bbox, null);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it("returns original bbox for non-matrix transform", () => {
    const bbox: [number, number, number, number] = [10, 20, 30, 40];
    const result = applyMatrixTransformToBbox(bbox, "rotate(45)");
    expect(result).toEqual([10, 20, 30, 40]);
  });
});

describe("Raster Image Bbox Computation", () => {
  it("respects x/y positioning on image elements", () => {
    const elem = '<image x="100" y="50" width="20" height="10"/>';
    const bbox = computeImageViewportBbox(elem, []);
    expect(bbox).toEqual([100, 50, 120, 60]);
  });

  it("applies image-level transform before ancestor group transforms", () => {
    const elem = '<image x="100" y="50" width="20" height="10" transform="matrix(1,0,0,1,10,20)"/>';
    const stack = ['<g transform="matrix(2,0,0,2,0,0)">'];
    const bbox = computeImageViewportBbox(elem, stack);
    expect(bbox).toEqual([220, 140, 260, 160]);
  });
});

describe("Clip Path Bounds Parsing", () => {
  it("parses simple path clip with transform", () => {
    const clipContent = '<path transform="matrix(1,0,0,1,10,20)" d="M0 0H100V100H0Z"/>';
    const bounds = parseClipPathBounds(clipContent);
    expect(bounds).toEqual([10, 20, 110, 120]);
  });

  it("parses path clip with Y-flip transform", () => {
    const clipContent = '<path transform="matrix(1,0,0,-1,0,100)" d="M0 0H50V50H0Z"/>';
    const bounds = parseClipPathBounds(clipContent);
    expect(bounds).toEqual([0, 50, 50, 100]);
  });

  it("parses rect clip element", () => {
    const clipContent = '<rect x="10" y="20" width="100" height="50"/>';
    const bounds = parseClipPathBounds(clipContent);
    expect(bounds).toEqual([10, 20, 110, 70]);
  });

  it("returns null for empty content", () => {
    expect(parseClipPathBounds("")).toBeNull();
  });
});

describe("Page-Level Clip Detection", () => {
  const pageWidth = 500;
  const pageHeight = 700;

  it("identifies full-page clip as page-level", () => {
    const clipBounds: [number, number, number, number] = [0, 0, 500, 700];
    expect(isPageLevelClip(clipBounds, pageWidth, pageHeight)).toBe(true);
  });

  it("identifies >90% page coverage as page-level", () => {
    const clipBounds: [number, number, number, number] = [-10, -10, 510, 710];
    expect(isPageLevelClip(clipBounds, pageWidth, pageHeight)).toBe(true);
  });

  it("identifies small clip as NOT page-level", () => {
    const clipBounds: [number, number, number, number] = [0, 100, 500, 200];
    expect(isPageLevelClip(clipBounds, pageWidth, pageHeight)).toBe(false);
  });

  it("identifies clip mostly outside page as NOT page-level", () => {
    const clipBounds: [number, number, number, number] = [450, 0, 1000, 700];
    expect(isPageLevelClip(clipBounds, pageWidth, pageHeight)).toBe(false);
  });

  it("handles clip with no intersection with page", () => {
    const clipBounds: [number, number, number, number] = [600, 800, 800, 1000];
    expect(isPageLevelClip(clipBounds, pageWidth, pageHeight)).toBe(false);
  });

  it("returns false for null bounds", () => {
    expect(isPageLevelClip(null, pageWidth, pageHeight)).toBe(false);
  });
});

describe("Small-group filtering", () => {
  it("filters out groups where both dimensions are below MIN_VECTOR_DIMENSION", async () => {
    const pdfBuffer = createSmallGroupTestPdf();
    const result = await extractPdf({ pdfBuffer });
    const page = result.pages[0];

    // Should have exactly 1 image — the 100x100 rect. The 10x10 rect should be filtered.
    expect(page.images.length).toBe(1);
    // The extracted image should be the larger shape
    expect(page.images[0].width).toBeGreaterThan(20);
    expect(page.images[0].height).toBeGreaterThan(20);
  });
});

// Integration tests using generated test PDF
describe("Vector Image Extraction with Clipping", () => {
  const pdfBuffer = createTestPdf();

  it("extracts clipped vector shapes", async () => {
    // Page 1 has red + blue rects inside clips, plus unclipped green + orange rects
    const result = await extractPdf({ pdfBuffer, startPage: 1, endPage: 1 });
    expect(result.pages).toHaveLength(1);

    const page = result.pages[0];
    expect(page.images.length).toBeGreaterThan(0);

    for (const img of page.images) {
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(img.pngBuffer[0]).toBe(0x89); // PNG magic
    }
  });

  it("groups overlapping shapes and separates non-overlapping ones", async () => {
    // Page 1: two overlapping green rects (grouped) + one isolated orange rect (separate)
    // Plus two clipped rects in different clips (separate from each other)
    const result = await extractPdf({ pdfBuffer, startPage: 1, endPage: 1 });
    const page = result.pages[0];

    // Should have at least 3 images:
    // - clipped red rect
    // - clipped blue rect
    // - grouped green rects (2 overlapping -> 1 image)
    // - isolated orange rect
    // (orange may be filtered if too small, but we should have >= 3)
    expect(page.images.length).toBeGreaterThanOrEqual(3);
  });

  it("handles nested clips (clip intersection)", async () => {
    // Page 2: magenta rect inside nested clip_1 > clip_2
    const result = await extractPdf({ pdfBuffer, startPage: 2, endPage: 2 });
    const page = result.pages[0];

    expect(page.images.length).toBeGreaterThan(0);

    // All images should be valid PNGs with transparency
    for (const img of page.images) {
      const meta = getPngMetadata(img.pngBuffer);
      expect(meta.channels).toBe(4); // RGBA
    }
  });
});

describe("Raster Image Extraction with Clipping", () => {
  const pdfBuffer = createTestPdf();

  it("extracts raster image with clip-path applied", async () => {
    // Page 3: image clipped by a rectangle
    const result = await extractPdf({ pdfBuffer, startPage: 3, endPage: 3 });
    const page = result.pages[0];

    // Should have at least 1 raster image (the clipped one)
    const rasterImages = page.images.filter((img) => img.imageId.startsWith("pg003_im"));
    expect(rasterImages.length).toBeGreaterThanOrEqual(1);

    // The clipped image should have an alpha channel
    const meta = getPngMetadata(rasterImages[0].pngBuffer);
    expect(meta.channels).toBe(4);
    expect(meta.hasAlpha).toBe(true);
  });

  it("clipped raster image is auto-cropped to opaque bounds", async () => {
    // Page 3: 200x200pt image clipped to 100x100pt rect
    // Rendered at 2x → 400x400px, clip = 200x200px, then auto-cropped to 200x200
    const result = await extractPdf({ pdfBuffer, startPage: 3, endPage: 3 });
    const page = result.pages[0];

    const rasterImages = page.images.filter((img) => img.imageId.startsWith("pg003_im"));
    expect(rasterImages.length).toBeGreaterThanOrEqual(1);

    const decoded = decodePng(rasterImages[0].pngBuffer);

    // After auto-crop, image should be smaller than the full 400px rendered size
    expect(decoded.width).toBeLessThan(400);
    expect(decoded.height).toBeLessThan(400);

    // Should have only opaque pixels (transparent padding was cropped away)
    let hasOpaque = false;
    let hasTransparent = false;
    for (let i = 3; i < decoded.data.length; i += 4) {
      if (decoded.data[i] === 255) hasOpaque = true;
      if (decoded.data[i] === 0) hasTransparent = true;
      if (hasOpaque && hasTransparent) break;
    }
    expect(hasOpaque).toBe(true);
    expect(hasTransparent).toBe(false);
  });

  it("extracts all pages without errors", async () => {
    const result = await extractPdf({ pdfBuffer });
    expect(result.pages).toHaveLength(3);

    for (const page of result.pages) {
      expect(page.pageImage.pngBuffer.length).toBeGreaterThan(0);
      expect(page.text).toBeDefined();
    }
  });
});
