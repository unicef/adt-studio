import { describe, it, expect } from "vitest";
import mupdf from "mupdf";
import { extractPdf } from "../extract.js";
import { stitchPngsHorizontally, decodePng } from "../png-utils.js";
import { PNG } from "pngjs";

// Minimal valid PDF with one blank page (no content stream)
const MINIMAL_PDF = `%PDF-1.4
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
%%EOF`;

/**
 * Create a valid PDF with a Form XObject (vector graphic) using mupdf.
 */
function createPdfWithVectorForm(): Buffer {
  const doc = new mupdf.PDFDocument();

  // Create a Form XObject with a simple rectangle
  const formDict = doc.newDictionary();
  formDict.put("Type", doc.newName("XObject"));
  formDict.put("Subtype", doc.newName("Form"));
  const bbox = doc.newArray();
  bbox.push(0);
  bbox.push(0);
  bbox.push(100);
  bbox.push(100);
  formDict.put("BBox", bbox);

  // Form content stream: draw a rectangle
  const formContent = "0 0 100 100 re S";
  const formObj = doc.addStream(formContent, formDict);

  // Create page resources with the form
  const resources = doc.newDictionary();
  const xobjects = doc.newDictionary();
  xobjects.put("MyForm", formObj);
  resources.put("XObject", xobjects);

  // Page content: invoke the form
  const pageContent = "q /MyForm Do Q";

  // Add the page - addPage creates the page object, insertPage adds it to the tree
  const pageObj = doc.addPage([0, 0, 612, 792], 0, resources, pageContent);
  doc.insertPage(-1, pageObj);

  // Save to buffer
  const output = doc.saveToBuffer("").asUint8Array();
  return Buffer.from(output);
}

// Two-page PDF
const TWO_PAGE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
4 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000102 00000 n
0000000169 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
236
%%EOF`;

describe("extractPdf", () => {
  it("extracts a single page from a minimal PDF", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    const result = await extractPdf({ pdfBuffer });

    expect(result.totalPagesInPdf).toBe(1);
    expect(result.pages).toHaveLength(1);

    const page = result.pages[0];
    expect(page.pageNumber).toBe(1);
    expect(page.pageId).toBe("pg001");
    expect(page.text).toBe("");
    expect(page.pageImage).toBeDefined();
    expect(page.pageImage.buffer).toBeInstanceOf(Buffer);
    expect(page.pageImage.width).toBeGreaterThan(0);
    expect(page.pageImage.height).toBeGreaterThan(0);
    expect(page.pageImage.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(page.images).toEqual([]);
  });

  it("extracts multiple pages", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    const result = await extractPdf({ pdfBuffer });

    expect(result.totalPagesInPdf).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].pageId).toBe("pg001");
    expect(result.pages[1].pageId).toBe("pg002");
  });

  it("respects startPage option", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    const result = await extractPdf({ pdfBuffer, startPage: 2 });

    expect(result.totalPagesInPdf).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(2);
    expect(result.pages[0].pageId).toBe("pg002");
  });

  it("respects endPage option", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    const result = await extractPdf({ pdfBuffer, endPage: 1 });

    expect(result.totalPagesInPdf).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
  });

  it("respects both startPage and endPage options", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    const result = await extractPdf({ pdfBuffer, startPage: 1, endPage: 1 });

    expect(result.totalPagesInPdf).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
  });

  it("calls progress callback for each page", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    const progressCalls: { page: number; totalPages: number }[] = [];

    await extractPdf({ pdfBuffer }, (progress) => {
      progressCalls.push({ ...progress });
    });

    expect(progressCalls).toEqual([
      { page: 1, totalPages: 2 },
      { page: 2, totalPages: 2 },
    ]);
  });

  it("clamps endPage to actual page count", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    const result = await extractPdf({ pdfBuffer, endPage: 100 });

    expect(result.totalPagesInPdf).toBe(1);
    expect(result.pages).toHaveLength(1);
  });

  it("returns empty pages array when startPage exceeds page count", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    const result = await extractPdf({ pdfBuffer, startPage: 10 });

    expect(result.totalPagesInPdf).toBe(1);
    expect(result.pages).toHaveLength(0);
  });

  it("throws when startPage is not a finite integer", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    await expect(extractPdf({ pdfBuffer, startPage: Number.NaN })).rejects.toThrow(
      "startPage must be an integer >= 1"
    );
    await expect(extractPdf({ pdfBuffer, startPage: 1.5 })).rejects.toThrow(
      "startPage must be an integer >= 1"
    );
  });

  it("throws when endPage is not a finite integer", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    await expect(extractPdf({ pdfBuffer, endPage: Number.NaN })).rejects.toThrow(
      "endPage must be an integer >= 1"
    );
    await expect(extractPdf({ pdfBuffer, endPage: 0 })).rejects.toThrow(
      "endPage must be an integer >= 1"
    );
  });

  it("throws when endPage is less than startPage", async () => {
    const pdfBuffer = Buffer.from(TWO_PAGE_PDF);
    await expect(extractPdf({ pdfBuffer, startPage: 2, endPage: 1 })).rejects.toThrow(
      "endPage must be greater than or equal to startPage"
    );
  });

  it("returns PDF metadata", async () => {
    const pdfBuffer = Buffer.from(MINIMAL_PDF);
    const result = await extractPdf({ pdfBuffer });

    expect(result.pdfMetadata).toBeDefined();
    expect(typeof result.pdfMetadata).toBe("object");
  });

  it("throws on invalid PDF data", async () => {
    const pdfBuffer = Buffer.from("not a pdf");

    await expect(extractPdf({ pdfBuffer })).rejects.toThrow();
  });

  it("extracts vector images from Form XObjects", async () => {
    const pdfBuffer = createPdfWithVectorForm();
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];

    // Should have extracted the vector Form XObject (uses same _im format as raster images)
    expect(page.images.length).toBeGreaterThanOrEqual(1);

    const vecImage = page.images[0];
    expect(vecImage.imageId).toBe("pg001_im001");
    expect(vecImage.buffer).toBeInstanceOf(Buffer);
    expect(vecImage.width).toBeGreaterThan(0);
    expect(vecImage.height).toBeGreaterThan(0);
    expect(vecImage.hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

// Helper: create an N-page PDF using mupdf
function createNPagePdf(n: number): Buffer {
  const doc = new mupdf.PDFDocument();
  for (let i = 0; i < n; i++) {
    const resources = doc.newDictionary();
    const pageObj = doc.addPage(
      [0, 0, 612, 792],
      0,
      resources,
      `BT /F1 12 Tf 100 700 Td (Page ${i + 1}) Tj ET`
    );
    doc.insertPage(-1, pageObj);
  }
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

// Helper: create a tiny PNG of given dimensions
function createTestPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  // Fill with opaque red
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = 255;     // R
      png.data[idx + 1] = 0;   // G
      png.data[idx + 2] = 0;   // B
      png.data[idx + 3] = 255; // A
    }
  }
  return PNG.sync.write(png);
}

describe("stitchPngsHorizontally", () => {
  it("produces correct combined dimensions", () => {
    const left = createTestPng(100, 200);
    const right = createTestPng(150, 200);
    const result = stitchPngsHorizontally(left, right);
    const decoded = decodePng(result);
    expect(decoded.width).toBe(250);
    expect(decoded.height).toBe(200);
  });

  it("uses max height when pages differ", () => {
    const left = createTestPng(100, 150);
    const right = createTestPng(100, 200);
    const result = stitchPngsHorizontally(left, right);
    const decoded = decodePng(result);
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(200);
  });
});

describe("extractPdf spread mode", () => {
  it("merges 5 pages into 3 logical pages (cover + 2 spreads)", async () => {
    const pdfBuffer = createNPagePdf(5);
    const result = await extractPdf({ pdfBuffer, spreadMode: true });

    expect(result.totalPagesInPdf).toBe(5);
    expect(result.pages).toHaveLength(3);

    // Page 1: cover (standalone)
    expect(result.pages[0].pageId).toBe("pg001");
    expect(result.pages[0].pageNumber).toBe(1);

    // Pages 2+3: first spread
    expect(result.pages[1].pageId).toBe("pg002003");
    expect(result.pages[1].pageNumber).toBe(2);

    // Pages 4+5: second spread
    expect(result.pages[2].pageId).toBe("pg004005");
    expect(result.pages[2].pageNumber).toBe(4);
  });

  it("handles even page count (last page unpaired)", async () => {
    const pdfBuffer = createNPagePdf(6);
    const result = await extractPdf({ pdfBuffer, spreadMode: true });

    // cover + spreads 2+3, 4+5 + standalone 6
    expect(result.pages).toHaveLength(4);
    expect(result.pages[0].pageId).toBe("pg001");
    expect(result.pages[1].pageId).toBe("pg002003");
    expect(result.pages[2].pageId).toBe("pg004005");
    expect(result.pages[3].pageId).toBe("pg006");
    expect(result.pages[3].pageNumber).toBe(6);
  });

  it("spread page image is wider than a single page", async () => {
    const pdfBuffer = createNPagePdf(3);
    const result = await extractPdf({ pdfBuffer, spreadMode: true });

    const coverWidth = result.pages[0].pageImage.width;
    const spreadWidth = result.pages[1].pageImage.width;
    // Spread should be roughly 2x the width of a single page
    expect(spreadWidth).toBeGreaterThan(coverWidth * 1.5);
  });

  it("spreadMode false (default) produces normal pages", async () => {
    const pdfBuffer = createNPagePdf(4);
    const result = await extractPdf({ pdfBuffer });

    expect(result.pages).toHaveLength(4);
    expect(result.pages[0].pageId).toBe("pg001");
    expect(result.pages[1].pageId).toBe("pg002");
    expect(result.pages[2].pageId).toBe("pg003");
    expect(result.pages[3].pageId).toBe("pg004");
  });

  it("spread page image ids use the spread pageId", async () => {
    const pdfBuffer = createNPagePdf(3);
    const result = await extractPdf({ pdfBuffer, spreadMode: true });

    expect(result.pages[1].pageImage.imageId).toBe("pg002003_page");
  });

  it("reports correct progress for spread mode", async () => {
    const pdfBuffer = createNPagePdf(5);
    const progressCalls: { page: number; totalPages: number }[] = [];
    await extractPdf({ pdfBuffer, spreadMode: true }, (p) => {
      progressCalls.push({ ...p });
    });

    expect(progressCalls).toEqual([
      { page: 1, totalPages: 3 },
      { page: 2, totalPages: 3 },
      { page: 3, totalPages: 3 },
    ]);
  });

  it("anchors grouping to the selected start page", async () => {
    const pdfBuffer = createNPagePdf(7);
    const result = await extractPdf({
      pdfBuffer,
      spreadMode: true,
      startPage: 3,
    });

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].pageId).toBe("pg003");
    expect(result.pages[1].pageId).toBe("pg004005");
    expect(result.pages[2].pageId).toBe("pg006007");
  });

  it("still starts with a standalone page for even start pages", async () => {
    const pdfBuffer = createNPagePdf(7);
    const result = await extractPdf({
      pdfBuffer,
      spreadMode: true,
      startPage: 4,
    });

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].pageId).toBe("pg004");
    expect(result.pages[1].pageId).toBe("pg005006");
    expect(result.pages[2].pageId).toBe("pg007");
  });
});
