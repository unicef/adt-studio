import { describe, expect, it } from "vitest"
import { PNG } from "pngjs"
import { detectGeometricSegments, segmentPageImagesGeometrically } from "../image-segmentation.js"

function makeCutoutWorksheetPng(): Buffer {
  const width = 220
  const height = 140
  const png = new PNG({ width, height })

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255
    png.data[i + 1] = 255
    png.data[i + 2] = 255
    png.data[i + 3] = 255
  }

  drawRect(png, 20, 25, 75, 85, 230, 80, 90)
  drawRect(png, 125, 25, 180, 85, 80, 135, 225)
  drawRect(png, 10, 115, 14, 119, 20, 20, 20)

  return PNG.sync.write(png)
}

function drawRect(
  png: PNG,
  left: number,
  top: number,
  right: number,
  bottom: number,
  red: number,
  green: number,
  blue: number,
): void {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * png.width + x) * 4
      png.data[offset] = red
      png.data[offset + 1] = green
      png.data[offset + 2] = blue
      png.data[offset + 3] = 255
    }
  }
}

describe("detectGeometricSegments", () => {
  it("detects large separated cut-out regions and ignores tiny marks", () => {
    const image = makeCutoutWorksheetPng()
    const segments = detectGeometricSegments(image.toString("base64"), 220, 140)

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ cropLeft: 11, cropTop: 16, cropRight: 84, cropBottom: 94 })
    expect(segments[1]).toMatchObject({ cropLeft: 116, cropTop: 16, cropRight: 189, cropBottom: 94 })
  })
})

describe("segmentPageImagesGeometrically", () => {
  it("builds segmentation output without requiring an LLM response", () => {
    const image = makeCutoutWorksheetPng()
    const output = segmentPageImagesGeometrically({
      pageId: "pg001",
      pageImageBase64: image.toString("base64"),
      images: [
        {
          imageId: "pg001_im001",
          imageBase64: image.toString("base64"),
          width: 220,
          height: 140,
        },
      ],
    })

    expect(output.results).toHaveLength(1)
    expect(output.results[0].needsSegmentation).toBe(true)
    expect(output.results[0].segments).toHaveLength(2)
  })
})
