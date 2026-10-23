import { PNG } from "pngjs"
import jpeg from "jpeg-js"
import { GeneratedImagePayload, type ValidatedGeneratedImage } from "@adt/types"

/** Decode before caching/saving, not merely checking magic bytes or dimensions. */
export function validateGeneratedImage(value: unknown): ValidatedGeneratedImage {
  const parsed = GeneratedImagePayload.safeParse(value)
  if (!parsed.success) {
    throw new Error("Invalid generated image response")
  }
  const { base64, mimeType } = parsed.data
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    throw new Error("Unsupported generated image format; expected PNG or JPEG")
  }
  const bytes = Buffer.from(base64, "base64")
  if (!bytes.length || bytes.toString("base64") !== base64) {
    throw new Error("Invalid generated image encoding")
  }
  let width: number
  let height: number
  try {
    if (mimeType === "image/png") {
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
          bytes.subarray(12, 16).toString() !== "IHDR" ||
          bytes.subarray(-12).toString("hex") !== "0000000049454e44ae426082") {
        throw new Error("Invalid PNG structure")
      }
      // Bound decompression before allocating the pixel buffer (64 megapixels).
      width = bytes.readUInt32BE(16)
      height = bytes.readUInt32BE(20)
      if (!width || !height || width * height > 64_000_000) {
        throw new Error("Invalid or excessive PNG dimensions")
      }
      PNG.sync.read(bytes, { checkCRC: true })
    } else {
      if (bytes.subarray(0, 2).toString("hex") !== "ffd8" ||
          bytes.subarray(-2).toString("hex") !== "ffd9") {
        throw new Error("Invalid JPEG structure")
      }
      const decoded = jpeg.decode(bytes, {
        useTArray: true, tolerantDecoding: false,
        maxResolutionInMP: 64, maxMemoryUsageInMB: 512,
      })
      width = decoded.width
      height = decoded.height
    }
  } catch {
    // A decoder failure can mean corrupt bytes OR an unsupported encoding.
    throw new Error("Generated image could not be decoded: invalid data, unsupported encoding, or image too large")
  }
  if (!width || !height) throw new Error("Generated image has invalid dimensions")
  return { base64, mimeType, width, height }
}
