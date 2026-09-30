import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { _testing, extractPdf, type ExtractedImage } from "../extract.js";
import { createRasterOnlyTestPdf } from "./create-test-pdf.js";

describe("extractPdf — per-image bounds", () => {
  it("populates bounds on raster images with a PDF placement", async () => {
    // Test PDF places a 30x30 native image at (100, 300) scaled to 200x200pt
    // on a 612x792pt page. mupdf's preserve-images walker returns bboxes in
    // top-left page coordinates, so the expected y is 792 - 300 - 200 = 292.
    // Per-image bounds are stamped by the stream-order recorder, which only
    // runs for fixed-layout extraction (the sole consumer of bounds).
    const pdfBuffer = createRasterOnlyTestPdf();
    const result = await extractPdf({ pdfBuffer, fixedLayout: true });

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    expect(page.images.length).toBeGreaterThanOrEqual(1);

    const raster = page.images.find((img) => img.renderMethod === "raster");
    expect(raster).toBeDefined();
    expect(raster!.bounds).toBeDefined();
    expect(raster!.bounds!.x).toBeCloseTo(100, 0);
    expect(raster!.bounds!.y).toBeCloseTo(292, 0);
    expect(raster!.bounds!.width).toBeCloseTo(200, 0);
    expect(raster!.bounds!.height).toBeCloseTo(200, 0);
  });

  it("maps alpha content bounds through the image orientation", () => {
    const png = new PNG({ width: 8, height: 6 });
    png.data.fill(0);
    for (let y = 2; y <= 3; y++) {
      for (let x = 1; x <= 2; x++) {
        const offset = (y * png.width + x) * 4;
        png.data[offset] = 20;
        png.data[offset + 1] = 40;
        png.data[offset + 2] = 60;
        png.data[offset + 3] = 255;
      }
    }

    const buffer = PNG.sync.write(png);
    const image: ExtractedImage = {
      imageId: "pg001_im001",
      pageId: "pg001",
      buffer,
      format: "png",
      width: 8,
      height: 6,
      hash: "test",
      bounds: { x: 100, y: 200, width: 60, height: 80 },
      orientationTransform: "rotate-90-clockwise",
    };

    // The one-pixel guard expands the source extent to [0,1,4,5]. A 90°
    // clockwise turn maps that to [1,0,5,4] in the 6x8 oriented image.
    expect(_testing.rasterContentBboxOnPage(image)).toEqual([110, 200, 150, 240]);
  });
});
