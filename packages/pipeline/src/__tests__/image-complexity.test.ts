import { describe, it, expect } from "vitest"
import { PNG } from "pngjs"
import jpeg from "jpeg-js"
import { grayscaleStdDev } from "../image-complexity.js"

function makeSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

function makeGradientPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const val = Math.floor((x / width) * 255)
      png.data[idx] = val
      png.data[idx + 1] = val
      png.data[idx + 2] = val
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

function makeSolidJpeg(width: number, height: number, r: number, g: number, b: number): Buffer {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  const raw = { data, width, height }
  return Buffer.from(jpeg.encode(raw, 100).data)
}

describe("grayscaleStdDev", () => {
  it("returns 0 for a solid white PNG", () => {
    const png = makeSolidPng(10, 10, 255, 255, 255)
    expect(grayscaleStdDev(png)).toBeCloseTo(0, 1)
  })

  it("returns 0 for a solid color PNG", () => {
    const png = makeSolidPng(10, 10, 128, 64, 32)
    expect(grayscaleStdDev(png)).toBeCloseTo(0, 1)
  })

  it("returns 0 for a solid black PNG", () => {
    const png = makeSolidPng(10, 10, 0, 0, 0)
    expect(grayscaleStdDev(png)).toBeCloseTo(0, 1)
  })

  it("returns significant stddev for a gradient PNG", () => {
    const png = makeGradientPng(256, 1)
    const stddev = grayscaleStdDev(png)
    expect(stddev).toBeGreaterThan(50)
  })

  it("decodes and computes stddev for JPEG images", () => {
    const jpegSolid = makeSolidJpeg(10, 10, 255, 255, 255)
    // JPEG compression may introduce slight variation even for solid images
    expect(grayscaleStdDev(jpegSolid)).toBeLessThan(5)
  })

  it("throws for unsupported image format", () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03])
    expect(() => grayscaleStdDev(garbage)).toThrow("Unsupported image format")
  })
})
