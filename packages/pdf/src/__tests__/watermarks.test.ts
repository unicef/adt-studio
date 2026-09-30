import { describe, it, expect } from "vitest";
import mupdf from "mupdf";
import { extractPdf } from "../extract.js";
import {
  detectTextWatermarks,
  isWatermarkLine,
  type WatermarkSignature,
} from "../watermarks.js";
import { decodePng } from "../png-utils.js";
import { createWatermarkedTestPdf } from "./create-test-pdf.js";

function openDoc(buffer: Buffer): InstanceType<typeof mupdf.PDFDocument> {
  return mupdf.PDFDocument.openDocument(buffer, "application/pdf") as InstanceType<
    typeof mupdf.PDFDocument
  >;
}

/** Sample one RGB pixel from a PNG buffer. */
function samplePixel(png: Buffer, x: number, y: number): [number, number, number] {
  const { data, width, height } = decodePng(png);
  const stride = data.length / (width * height);
  const offset = (y * width + x) * stride;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

/** Count strongly red pixels (the watermark fill) in a PNG buffer. */
function countRedPixels(png: Buffer): number {
  const { data, width, height } = decodePng(png);
  const stride = data.length / (width * height);
  let red = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * stride];
    const g = data[i * stride + 1];
    const b = data[i * stride + 2];
    if (r > 180 && g < 90 && b < 90) red++;
  }
  return red;
}

describe("detectTextWatermarks", () => {
  it("finds the repeated diagonal stamp but not running heads or content", () => {
    const doc = openDoc(createWatermarkedTestPdf(4));
    const signatures = detectTextWatermarks(doc);

    expect(signatures).toHaveLength(1);
    expect(signatures[0].text).toBe("FORTESTINGONLY");
    expect(signatures[0].rotated).toBe(true);
    expect(signatures[0].pagesSeen).toBe(4);
    expect(signatures[0].pagesSampled).toBe(4);
  });

  it("returns nothing for single-page documents", () => {
    const doc = openDoc(createWatermarkedTestPdf(1));
    expect(detectTextWatermarks(doc)).toEqual([]);
  });
});

describe("isWatermarkLine", () => {
  const sigs: WatermarkSignature[] = [
    { text: "FORTESTINGONLY", bbox: [0, 0, 100, 100], rotated: true, pagesSeen: 4, pagesSampled: 4 },
  ];

  it("matches the single-op form and word-by-word compositions", () => {
    expect(isWatermarkLine("FOR TESTING ONLY", [0, 0, 100, 100], sigs)).toBe(true);
    expect(isWatermarkLine("FORTESTINGONLY", [0, 0, 100, 100], sigs)).toBe(true);

    const wordSigs: WatermarkSignature[] = [
      { text: "FOR", bbox: [0, 0, 25, 100], rotated: true, pagesSeen: 4, pagesSampled: 4 },
      { text: "TESTING", bbox: [25, 0, 75, 100], rotated: true, pagesSeen: 4, pagesSampled: 4 },
      { text: "ONLY", bbox: [75, 0, 100, 100], rotated: true, pagesSeen: 4, pagesSampled: 4 },
    ];
    expect(isWatermarkLine("FOR TESTING ONLY", [0, 0, 100, 100], wordSigs)).toBe(true);
  });

  it("never matches lines that carry real content", () => {
    expect(isWatermarkLine("FOR TESTING ONLY use pencil", [0, 0, 100, 100], sigs)).toBe(false);
    expect(isWatermarkLine("Content of page one", [0, 0, 100, 100], sigs)).toBe(false);
    expect(isWatermarkLine("", [0, 0, 100, 100], sigs)).toBe(false);
    expect(isWatermarkLine("FOR TESTING ONLY", [200, 200, 300, 300], sigs)).toBe(false);
    expect(isWatermarkLine("FOR TESTING ONLY", undefined, sigs)).toBe(false);
  });
});

describe("extractPdf with removeWatermarks", () => {
  it("removes the stamp from text, positioned text, and page pixels", async () => {
    const pdfBuffer = createWatermarkedTestPdf(4);

    const dirty = await extractPdf({ pdfBuffer, startPage: 1, endPage: 1 });
    const clean = await extractPdf({
      pdfBuffer,
      startPage: 1,
      endPage: 1,
      removeWatermarks: true,
    });

    const dirtyPage = dirty.pages[0];
    const cleanPage = clean.pages[0];

    // Reflowable text: watermark line gone, content and running head intact.
    expect(dirtyPage.text).toContain("FOR TESTING ONLY");
    expect(cleanPage.text).not.toContain("FOR TESTING ONLY");
    expect(cleanPage.text).toContain("Content of page one");
    expect(cleanPage.text).toContain("Running Head");

    // Positioned text: the watermark paragraph is dropped.
    const cleanParagraphs = cleanPage.positionedText.drawItems
      .filter((item) => item.kind === "paragraph")
      .map((item) => (item as { text: string }).text);
    expect(cleanParagraphs.join("\n")).not.toContain("FOR TESTING");
    expect(cleanParagraphs.join("\n")).toContain("Content of page one");

    // Page render: the red diagonal stamp is gone from the pixels.
    const dirtyRed = countRedPixels(dirtyPage.pageImage.buffer);
    const cleanRed = countRedPixels(cleanPage.pageImage.buffer);
    expect(dirtyRed).toBeGreaterThan(1000);
    expect(cleanRed).toBeLessThan(dirtyRed / 100);

    // The applied signatures are recorded for inspection.
    expect(cleanPage.extractionDebug?.watermarks).toHaveLength(1);
    expect(cleanPage.extractionDebug?.watermarks?.[0].text).toBe("FORTESTINGONLY");
    expect(dirtyPage.extractionDebug?.watermarks).toBeUndefined();

    // fillShade forwarding: the gradient (a `sh` shading op) survives the
    // filtered render identically. PDF rect (400..500, 560..660) maps to
    // device (800..1000, 264..464) at 2x with a top-left origin.
    const dirtyShade = samplePixel(dirtyPage.pageImage.buffer, 900, 360);
    const cleanShade = samplePixel(cleanPage.pageImage.buffer, 900, 360);
    expect(cleanShade).toEqual(dirtyShade);
    // Not white — the gradient actually painted.
    expect(Math.min(...cleanShade)).toBeLessThan(200);
  });

  it("produces clean figure crops on watermarked pages", async () => {
    const pdfBuffer = createWatermarkedTestPdf(4);
    const clean = await extractPdf({
      pdfBuffer,
      startPage: 2,
      endPage: 2,
      removeWatermarks: true,
    });

    // Page 2 has the raster + overlapping vector — a page-crop composite cut
    // from the page render, which crosses the diagonal stamp's path.
    const page = clean.pages[0];
    const composites = page.images.filter((image) => image.renderMethod === "page-crop");
    expect(composites.length).toBeGreaterThanOrEqual(1);
    for (const composite of composites) {
      expect(countRedPixels(composite.buffer)).toBe(0);
    }
  });
});
