import { describe, expect, it } from "vitest"
import { validateGeneratedImage } from "../image-validation.js"
import { jpg, png } from "./image-fixtures.js"

describe("validateGeneratedImage", () => {
  it.each([[png, "image/png"], [jpg, "image/jpeg"]])("decodes supported output", (base64, mimeType) => {
    expect(validateGeneratedImage({ base64, mimeType })).toEqual({ base64, mimeType, width: 4, height: 6 })
  })

  it("reads extended sequential JPEGs and dimensions beyond large metadata segments", () => {
    const bytes = Buffer.from(jpg, "base64")
    bytes[bytes.indexOf(Buffer.from("ffc0", "hex")) + 1] = 0xc1
    const metadata = Buffer.alloc(7004)
    metadata.writeUInt16BE(0xffe1, 0)
    metadata.writeUInt16BE(7002, 2)
    const base64 = Buffer.concat([bytes.subarray(0, 2), metadata, bytes.subarray(2)]).toString("base64")
    expect(validateGeneratedImage({ base64, mimeType: "image/jpeg" })).toMatchObject({ width: 4, height: 6 })
  })

  it.each([
    { base64: Buffer.from("ffd8ffd9", "hex").toString("base64"), mimeType: "image/jpeg" },
    { base64: png, mimeType: "image/jpeg" },
    { base64: jpg.slice(0, -4), mimeType: "image/jpeg" },
    { base64: `${png}!`, mimeType: "image/png" },
    { base64: "", mimeType: "image/png" },
    { base64: null, mimeType: "image/png" },
  ])("rejects malformed and mislabeled results", (result) => {
    expect(() => validateGeneratedImage(result)).toThrow(/Invalid|could not be decoded/)
  })

  it("rejects corrupt pixel data even with a valid header, dimensions and trailer", () => {
    const bytes = Buffer.from(png, "base64")
    bytes[50] ^= 0xff
    expect(() => validateGeneratedImage({ base64: bytes.toString("base64"), mimeType: "image/png" })).toThrow("could not be decoded")
  })

  it("distinguishes unsupported output formats from bad supported-format data", () => {
    expect(() => validateGeneratedImage({ base64: "R0lGODlh", mimeType: "image/gif" })).toThrow("Unsupported generated image format")
  })

  it("rejects excessive PNG dimensions before attempting decompression", () => {
    const bytes = Buffer.from(png, "base64")
    bytes.writeUInt32BE(100_000, 16)
    expect(() => validateGeneratedImage({ base64: bytes.toString("base64"), mimeType: "image/png" })).toThrow("image too large")
  })
})
