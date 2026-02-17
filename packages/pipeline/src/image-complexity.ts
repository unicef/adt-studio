import { decodePng } from "@adt/pdf"
import jpeg from "jpeg-js"

/**
 * Compute the standard deviation of grayscale pixel values for an image.
 * Low stddev indicates a blank or near-blank image (solid color, white page, etc.).
 *
 * Supports JPEG and PNG formats (detected via magic bytes).
 */
export function grayscaleStdDev(imageBuffer: Buffer): number {
  const pixels = decodeToRgba(imageBuffer)
  const pixelCount = pixels.length / 4

  // First pass: compute mean grayscale value
  let sum = 0
  for (let i = 0; i < pixels.length; i += 4) {
    sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
  }
  const mean = sum / pixelCount

  // Second pass: compute variance
  let varianceSum = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    const diff = gray - mean
    varianceSum += diff * diff
  }

  return Math.sqrt(varianceSum / pixelCount)
}

function decodeToRgba(imageBuffer: Buffer): Uint8Array {
  // JPEG: starts with 0xFF 0xD8
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    const decoded = jpeg.decode(imageBuffer, { useTArray: true })
    return decoded.data
  }

  // PNG: starts with 0x89 0x50 0x4E 0x47
  if (
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    const { data } = decodePng(imageBuffer)
    return data
  }

  throw new Error(
    `Unsupported image format (magic bytes: 0x${imageBuffer[0].toString(16)} 0x${imageBuffer[1].toString(16)})`
  )
}
