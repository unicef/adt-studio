/**
 * Regression: pages that SHARE one resource dictionary listing several
 * same-dimension images must each render the image their own content stream
 * draws — not all collapse to the first one.
 *
 * This reproduces the structure emitted by layer-compositing PDF tools (e.g.
 * a "LayerPDF" generator): a single `/Resources` object, referenced by every
 * page, whose `/XObject` dict lists every full-page layer image. Each page's
 * content stream draws exactly one of them (`/I{n} Do`), a different one per
 * page, but they all share identical native dimensions.
 *
 * The bug this guards: `stampRasterPlacementsFromOps` matched draw-ops to
 * extracted images by native dimensions alone and consumed the first
 * candidate. With every page seeing all N same-size images, every page paired
 * its single draw-op with the FIRST image — so every page rendered the same
 * background. The fix disambiguates same-dimension candidates by a pixel
 * content digest (recorder `contentDigest` ↔ extracted `pixelDigest`).
 */
import { describe, it, expect } from "vitest"
import { createSharedResourceLayerPdf } from "./shared-resource-pdf.fixture.js"
import { createHash } from "node:crypto"
import { extractPdf } from "../extract.js"

/** The single image draw item on a page, with the byte hash of the extracted
 *  image it references. */
function drawnImage(page: {
  positionedText: { drawItems: Array<Record<string, unknown>> }
  images: Array<{ imageId: string; buffer: Buffer }>
}): { imageId: string; contentHash: string } {
  const imageItems = page.positionedText.drawItems.filter((d) => d.kind === "image")
  expect(imageItems).toHaveLength(1)
  const imageId = imageItems[0].imageId as string
  const img = page.images.find((im) => im.imageId === imageId)
  if (!img) throw new Error(`drawItem references missing image ${imageId}`)
  return { imageId, contentHash: createHash("md5").update(img.buffer).digest("hex") }
}

describe("shared resource dictionary — same-dimension image disambiguation", () => {
  it("renders each page's OWN layer, not the first one, when all layers share a resources dict", async () => {
    const n = 4
    const result = await extractPdf({ pdfBuffer: createSharedResourceLayerPdf(n), fixedLayout: true })
    expect(result.pages).toHaveLength(n)

    const drawn = result.pages.map(drawnImage)

    // Core regression: every page draws a DISTINCT background. Before the fix
    // all pages collapsed to a single image, so this set had size 1.
    const distinct = new Set(drawn.map((d) => d.contentHash))
    expect(distinct.size).toBe(n)

    // Exact correctness: keys sort I0..I{n-1} (alphabetical == numerical for
    // n < 10), so extraction assigns im001=I0, im002=I1, … Page i draws /I{i},
    // so it must map to im00{i+1}. (Digest matching itself is order-independent;
    // only this exact-imageId assertion relies on the key sort.)
    drawn.forEach((d, i) => {
      expect(d.imageId).toMatch(new RegExp(`_im${String(i + 1).padStart(3, "0")}$`))
    })

    // Every page sees the full shared set of N images (proves the dict is
    // genuinely shared — the precondition that made matching ambiguous).
    for (const page of result.pages) {
      const raster = page.images.filter((im) => /_im\d+$/.test(im.imageId))
      expect(raster).toHaveLength(n)
    }
  })

  it("leaves a normal page (one image, unique dimensions) unchanged", async () => {
    // Single page, single image — no dimension collision, so the cheap
    // dimension-only match (no digests) still applies and must still work.
    const result = await extractPdf({ pdfBuffer: createSharedResourceLayerPdf(1), fixedLayout: true })
    expect(result.pages).toHaveLength(1)
    const { imageId } = drawnImage(result.pages[0])
    expect(imageId).toMatch(/_im001$/)
  })
})
