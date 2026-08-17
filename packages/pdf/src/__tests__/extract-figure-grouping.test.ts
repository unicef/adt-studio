import { describe, it, expect } from "vitest";
import { extractPdf, _testing } from "../extract.js";
import { createFigureGroupTestPdf, createRasterOnlyTestPdf, createFigureWithTextPdf } from "./create-test-pdf.js";

const { applyMatrixTransformToBbox } = _testing;

describe("Figure grouping", () => {
  it("groups overlapping raster image and vector shapes into a single figure", async () => {
    const pdfBuffer = createFigureGroupTestPdf();
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];

    // We expect:
    // - The raster image + overlapping red rect should be merged into a figure group
    //   (cropped from the page render)
    // - The isolated blue rect should be a separate vector image
    // - The standalone raster should be deduplicated (removed) since it's in a figure group
    //
    // Raster draw-op placements are injected into grouping even when mupdf's
    // SVG omits <image> elements, so the overlapping raster + overlay is one
    // page-crop and the isolated blue rect is one vector image.
    expect(page.extractionDebug?.totalImageShapes).toBe(1);
    expect(page.extractionDebug?.groups.some((group) => group.hasImages)).toBe(true);
    expect(page.images).toHaveLength(2);
    expect(page.images.filter((image) => image.renderMethod === "page-crop")).toHaveLength(1);
    expect(page.images.filter((image) => image.renderMethod === "raster")).toHaveLength(0);

    // All images should have valid dimensions and buffers
    for (const img of page.images) {
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(img.buffer.length).toBeGreaterThan(0);
      expect(img.hash).toMatch(/^[a-f0-9]{16}$/);
    }
  });

  it("keeps covered standalone rasters and links them to the composite in keepCoveredRasters mode", async () => {
    const pdfBuffer = createFigureGroupTestPdf();
    const result = await extractPdf({ pdfBuffer, keepCoveredRasters: true });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];

    // The composite page-crop still exists, but the standalone raster it
    // absorbed is retained as its own image so meaningfulness can choose the
    // best representation downstream.
    const composites = page.images.filter((image) => image.renderMethod === "page-crop");
    const standalones = page.images.filter((image) => image.renderMethod === "raster");
    expect(composites).toHaveLength(1);
    expect(standalones).toHaveLength(1);

    // The debug group records exactly which standalone imageId it covers.
    const rasterGroup = page.extractionDebug?.groups.find((group) => group.hasImages);
    expect(rasterGroup?.coveredRasterImageIds).toEqual([standalones[0].imageId]);
    expect(rasterGroup?.imageId).toBe(composites[0].imageId);
  });

  it("does not affect pages with only raster images (no overlapping vectors)", async () => {
    const pdfBuffer = createRasterOnlyTestPdf();
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];

    // Should have at least 1 image (the raster) — no grouping since no overlapping vectors
    expect(page.images.length).toBeGreaterThanOrEqual(1);

    for (const img of page.images) {
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(img.buffer.length).toBeGreaterThan(0);
    }
  });

  it("preserves existing vector-only grouping behavior", async () => {
    const pdfBuffer = Buffer.from(
      `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
178
%%EOF`
    );
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].images).toEqual([]);
  });

  it("includes text labels near figures via spatial grouping", async () => {
    const pdfBuffer = createFigureWithTextPdf();
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];

    const rasterGroup = page.extractionDebug?.groups.find((group) => group.hasImages);
    expect(page.extractionDebug?.totalImageShapes).toBe(1);
    expect(rasterGroup?.hasText).toBe(true);
    expect(rasterGroup?.renderMethod).toBe("page-crop");
    expect(page.images.filter((image) => image.renderMethod === "raster")).toHaveLength(0);

    // The text "Figure 1" should be in the extracted text
    expect(page.text).toContain("Figure 1");

    for (const img of page.images) {
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(img.buffer.length).toBeGreaterThan(0);
    }
  });
});

describe("SVG image element bbox extraction", () => {
  it("handles translate transforms on image bboxes", () => {
    const bbox = applyMatrixTransformToBbox(
      [0, 0, 200, 200],
      "matrix(1,0,0,1,100,500)"
    );
    expect(bbox).toEqual([100, 500, 300, 700]);
  });

  it("handles scale + translate transforms on image bboxes", () => {
    const bbox = applyMatrixTransformToBbox(
      [0, 0, 100, 100],
      "matrix(2,0,0,2,50,100)"
    );
    expect(bbox).toEqual([50, 100, 250, 300]);
  });
});
