import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { renderImageThumbnail } from "../extract.js"

function png(width: number, height: number): Buffer {
  const image = new PNG({ width, height })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i / 4) % 256
    image.data[i + 1] = 120
    image.data[i + 2] = 200
    image.data[i + 3] = 255
  }
  return PNG.sync.write(image)
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  // Walk JPEG segments to the start-of-frame marker, which holds the size.
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  throw new Error("no frame")
}

describe("renderImageThumbnail", () => {
  it("shrinks a large PNG to a small JPEG at the given width, keeping its proportions", () => {
    const source = png(1200, 1800)
    const thumbnail = renderImageThumbnail(source, "image/png", { maxWidth: 320 })
    expect(thumbnail).not.toBeNull()
    expect([...thumbnail!.subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect(jpegSize(thumbnail!)).toEqual({ width: 320, height: 480 })
    expect(thumbnail!.length).toBeLessThan(source.length)
  })

  it("never enlarges a small image", () => {
    const thumbnail = renderImageThumbnail(png(200, 100), "image/png", { maxWidth: 320 })
    expect(jpegSize(thumbnail!)).toEqual({ width: 200, height: 100 })
  })

  it("returns null for bytes that aren't an image", () => {
    expect(renderImageThumbnail(new Uint8Array([1, 2, 3, 4]), "image/png", { maxWidth: 320 })).toBeNull()
  })
})
