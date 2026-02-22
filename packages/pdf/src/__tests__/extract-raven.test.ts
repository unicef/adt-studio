import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { extractPdf, type ExtractResult } from "../extract.js";

const RAVEN_PDF = resolve(import.meta.dirname, "../../../../tests/fixtures/raven.pdf");

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
    expect(p.pageImage.hash).toBe("de4641ff75b91c8f");
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
    expect(imgs[0].hash).toBe("f7c69061b5fb89ed");
    expect(imgs[0].width).toBe(546);
    expect(imgs[0].height).toBe(546);
    expect(imgs[1].imageId).toBe("pg001_im002");
    expect(imgs[1].hash).toBe("14b8a1e04e930b83");
  });

  // -- Page 2 --

  it("page 2 — correct page image hash", () => {
    expect(result.pages[1].pageImage.hash).toBe("adf24fa292e84cb4");
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
    expect(imgs[0].hash).toBe("2bdb94c1a5f96fe7");
    expect(imgs[1].hash).toBe("f7c69061b5fb89ed");
  });

  // -- Page 3 --

  it("page 3 — correct page image hash", () => {
    expect(result.pages[2].pageImage.hash).toBe("b4e15507c1191d6e");
  });

  it("page 3 — extracts story text", () => {
    const text = result.pages[2].text;
    expect(text).toContain("would love to fly");
    expect(text).toContain("into the sky");
  });

  it("page 3 — extracts 2 images with correct hashes", () => {
    const imgs = result.pages[2].images;
    expect(imgs).toHaveLength(2);
    expect(imgs[0].hash).toBe("1aecee2cc36cd072");
    expect(imgs[1].hash).toBe("b20ccebb2681ac27");
  });
});
