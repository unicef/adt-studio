import { describe, expect, it } from "vitest"
import { segmentBoundsOnPage } from "../image-segmentation.js"

describe("segmentBoundsOnPage", () => {
  it("maps a sub-region of the source image to page points", () => {
    // Source image placed at (100,200) on the page, 300x150 pt, rendered 600x300 px.
    const srcBounds = { x: 100, y: 200, width: 300, height: 150 }
    const out = segmentBoundsOnPage(srcBounds, 600, 300, {
      cropLeft: 0,
      cropTop: 0,
      cropRight: 300,
      cropBottom: 150,
    })
    // Top-left quarter (px) → top-left quarter of the placement (pt).
    expect(out).toEqual({ x: 100, y: 200, width: 150, height: 75 })
  })

  it("offsets by the crop origin within the source image", () => {
    const srcBounds = { x: 0, y: 0, width: 200, height: 200 }
    const out = segmentBoundsOnPage(srcBounds, 400, 400, {
      cropLeft: 100,
      cropTop: 200,
      cropRight: 300,
      cropBottom: 400,
    })
    // scale 0.5: origin (100,200)px → (50,100)pt; size 200x200px → 100x100pt.
    expect(out).toEqual({ x: 50, y: 100, width: 100, height: 100 })
  })

  it("returns the source bounds unchanged for degenerate source dimensions", () => {
    const srcBounds = { x: 5, y: 6, width: 10, height: 20 }
    expect(
      segmentBoundsOnPage(srcBounds, 0, 0, { cropLeft: 0, cropTop: 0, cropRight: 1, cropBottom: 1 })
    ).toEqual(srcBounds)
  })
})
