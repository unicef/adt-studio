import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { extractPdf, type ExtractResult } from "../extract.js";

const RAVEN_PDF = resolve(import.meta.dirname, "../../../../assets/raven.pdf");

describe("raven.pdf extraction", () => {
  let result: ExtractResult;

  beforeAll(async () => {
    const pdfBuffer = readFileSync(RAVEN_PDF);
    result = await extractPdf({ pdfBuffer: Buffer.from(pdfBuffer), startPage: 1, endPage: 3 });
  });

  it("reports correct total page count", () => {
    expect(result.totalPagesInPdf).toBe(12);
  });

  it("extracts PDF metadata", () => {
    expect(result.pdfMetadata.title).toBe("Hyena and Raven");
    expect(result.pdfMetadata.format).toBe("PDF 1.5");
  });

  it("extracts 3 pages", () => {
    expect(result.pages).toHaveLength(3);
  });

  // -- Page 1: cover --

  it("page 1 — correct page image hash and dimensions", () => {
    const p = result.pages[0];
    expect(p.pageId).toBe("pg001");
    expect(p.pageImage.hash).toBe("60cf1328f9e00c43");
    expect(p.pageImage.width).toBe(1190);
    expect(p.pageImage.height).toBe(840);
  });

  it("page 1 — extracts cover text", () => {
    expect(result.pages[0].text).toContain("Hyena and");
    expect(result.pages[0].text).toContain("Raven");
    expect(result.pages[0].text).toContain("Tony Lelliott");
  });

  it("page 1 — extracts 2 images with correct hashes", () => {
    const imgs = result.pages[0].images;
    expect(imgs).toHaveLength(2);
    expect(imgs[0].imageId).toBe("pg001_im001");
    expect(imgs[0].hash).toBe("6a81773d0ee11909");
    expect(imgs[0].width).toBe(776);
    expect(imgs[0].height).toBe(776);
    expect(imgs[1].imageId).toBe("pg001_im002");
    expect(imgs[1].hash).toBe("62e3220cce2c9111");
  });

  // -- Page 2 --

  it("page 2 — correct page image hash", () => {
    expect(result.pages[1].pageImage.hash).toBe("4934db2120500e6d");
  });

  it("page 2 — extracts story text", () => {
    const text = result.pages[1].text;
    expect(text).toContain("Hyena and Raven");
    expect(text).toContain("were once great");
    expect(text).toContain("friends");
  });

  it("page 2 — extracts 2 images with correct hashes", () => {
    const imgs = result.pages[1].images;
    expect(imgs).toHaveLength(2);
    expect(imgs[0].hash).toBe("46d1a129b569bbc2");
    expect(imgs[1].hash).toBe("2a686276c5f3ab6a");
  });

  // -- Page 3 --

  it("page 3 — correct page image hash", () => {
    expect(result.pages[2].pageImage.hash).toBe("8374a374170f5812");
  });

  it("page 3 — extracts story text", () => {
    const text = result.pages[2].text;
    expect(text).toContain("would love to fly");
    expect(text).toContain("into the sky");
  });

  it("page 3 — extracts 2 images with correct hashes", () => {
    const imgs = result.pages[2].images;
    expect(imgs).toHaveLength(2);
    expect(imgs[0].hash).toBe("af1a9d1d1f6501ed");
    expect(imgs[1].hash).toBe("ff402ed698ee7af8");
  });
});
