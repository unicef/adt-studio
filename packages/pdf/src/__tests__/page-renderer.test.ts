import { describe, it, expect } from "vitest";
import jpeg from "jpeg-js";
import { openPdfPageRenderer } from "../extract.js";
import { createTestPdf } from "./create-test-pdf.js";

describe("openPdfPageRenderer", () => {
  it("renders a page as a JPEG of the requested width", () => {
    const renderer = openPdfPageRenderer(createTestPdf());
    try {
      expect(renderer.pageCount).toBe(3);
      const image = renderer.renderJpeg(2, 120);
      expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(jpeg.decode(image).width).toBe(120);
    } finally {
      renderer.destroy();
    }
  });

  it("rejects pages outside the document", () => {
    const renderer = openPdfPageRenderer(createTestPdf());
    try {
      expect(() => renderer.renderJpeg(0, 120)).toThrow(RangeError);
      expect(() => renderer.renderJpeg(4, 120)).toThrow(RangeError);
    } finally {
      renderer.destroy();
    }
  });
});
