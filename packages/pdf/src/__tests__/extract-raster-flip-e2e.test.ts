import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { extractPdf } from "../extract.js";
import { createMirroredRasterTestPdf } from "./create-test-pdf.js";

/**
 * End-to-end regression test for the raster flip pipeline.
 *
 * Unlike the unit tests in `flip-utils.test.ts` and
 * `extract-raster-placement.test.ts` (which feed hand-authored CTM arrays
 * directly to internal functions) and the `raven.pdf` snapshot test in
 * `extract-raven.test.ts` (whose fixture contains no mirrored images, making
 * the flip pass a no-op there), this test parses a real PDF content stream
 * containing a `cm` with a negative scale and asserts the *extracted pixel
 * data* has the mirror correctly baked in (matching what the PDF actually
 * renders). This is the scenario from #590 that no other test exercises
 * end-to-end.
 */
describe("extractPdf — mirrored raster image (end-to-end)", () => {
  it("bakes a horizontal mirror into the extracted pixels", async () => {
    const pdfBuffer = createMirroredRasterTestPdf("horizontal");
    const result = await extractPdf({ pdfBuffer });

    const rasters = result.pages[0].images.filter((i) => i.renderMethod === "raster");
    expect(rasters).toHaveLength(1);

    const image = rasters[0];
    // flipTransform is cleared once applied (see applyFlipsToRasterImages),
    // so by the time extraction finishes it's undefined again — the pixel
    // buffer itself is the source of truth here.
    expect(image.flipTransform).toBeUndefined();

    // The embedded XObject bytes are left=red/right=blue, but the page's
    // negative-X `cm` mirrors it visually when rendered. The flip pass must
    // bake that mirror into the extracted buffer so it matches what the PDF
    // actually displays: left=blue/right=red.
    const png = PNG.sync.read(image.buffer);
    const leftPixel = pixelAt(png, 0, 0);
    const rightPixel = pixelAt(png, png.width - 1, 0);
    expect(leftPixel).toEqual([0, 0, 255]);
    expect(rightPixel).toEqual([255, 0, 0]);
  });

  it("bakes a vertical mirror into the extracted pixels", async () => {
    const pdfBuffer = createMirroredRasterTestPdf("vertical");
    const result = await extractPdf({ pdfBuffer });

    const rasters = result.pages[0].images.filter((i) => i.renderMethod === "raster");
    expect(rasters).toHaveLength(1);

    const image = rasters[0];
    expect(image.flipTransform).toBeUndefined();

    // The embedded XObject bytes are top=red/bottom=blue, but the page's
    // negative-Y `cm` mirrors it visually when rendered. The flip pass must
    // bake that mirror into the extracted buffer: top=blue/bottom=red.
    const png = PNG.sync.read(image.buffer);
    const topPixel = pixelAt(png, 0, 0);
    const bottomPixel = pixelAt(png, 0, png.height - 1);
    expect(topPixel).toEqual([0, 0, 255]);
    expect(bottomPixel).toEqual([255, 0, 0]);
  });
});

function pixelAt(png: PNG, x: number, y: number): [number, number, number] {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
}
