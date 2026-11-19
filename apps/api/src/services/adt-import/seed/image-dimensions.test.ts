import { describe, expect, it } from "vitest"
import { importedImageDimensions } from "./image-dimensions.js"

const enc = (text: string) => new TextEncoder().encode(text)
const size = (bytes: Uint8Array, extension: string) => {
  const { width, height } = importedImageDimensions(bytes, extension)
  return `${width}×${height}`
}

function gif(width: number, height: number) {
  const bytes = new Uint8Array(13)
  bytes.set(enc("GIF89a"))
  new DataView(bytes.buffer).setUint16(6, width, true)
  new DataView(bytes.buffer).setUint16(8, height, true)
  return bytes
}

function webp(chunk: "VP8 " | "VP8L", width: number, height: number) {
  const bytes = new Uint8Array(30)
  bytes.set(enc("RIFF"), 0)
  bytes.set(enc("WEBP"), 8)
  bytes.set(enc(chunk), 12)
  const view = new DataView(bytes.buffer)
  if (chunk === "VP8 ") {
    bytes.set([0x9d, 0x01, 0x2a], 23)
    view.setUint16(26, width, true)
    view.setUint16(28, height, true)
  } else {
    bytes[20] = 0x2f
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true)
  }
  return bytes
}

describe("importedImageDimensions", () => {
  it("reads an SVG's size from width and height, with or without px", () => {
    // The test-run case: an 800×500 replacement SVG was stored as 1024×1024.
    expect(size(enc(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"></svg>`), "svg")).toBe("800×500")
    expect(size(enc(`<svg width="800px" height="500px"></svg>`), "svg")).toBe("800×500")
  })

  it("falls back to the viewBox for relative sizes, in any number format", () => {
    expect(size(enc(`<svg width="100%" height="100%" viewBox="0 0 1200 300"></svg>`), "svg")).toBe("1200×300")
    expect(size(enc(`<svg viewBox="0 0 800.5 500 "></svg>`), "svg")).toBe("801×500")
    expect(size(enc(`<svg viewBox="0 0 8e2 500"></svg>`), "svg")).toBe("800×500")
    expect(size(enc(`<svg viewBox="0,0,640,480"></svg>`), "svg")).toBe("640×480")
  })

  it("finds the root element after a long editor header", () => {
    const header = `<?xml version="1.0"?>\n<!-- ${"Created with Inkscape ".repeat(260)} -->\n`
    expect(size(enc(`${header}<svg viewBox="0 0 800 500"></svg>`), "svg")).toBe("800×500")
  })

  it("keeps the 1024×1024 default when an SVG gives no size", () => {
    expect(size(enc(`<svg><rect/></svg>`), "svg")).toBe("1024×1024")
  })

  it("reads GIF and both lossy and lossless WebP headers", () => {
    expect(size(gif(320, 240), "gif")).toBe("320×240")
    expect(size(webp("VP8 ", 640, 360), "webp")).toBe("640×360")
    expect(size(webp("VP8L", 300, 200), "webp")).toBe("300×200")
  })
})
