/** Pixel size of an image file from an imported ADT, read from its header. */
export function importedImageDimensions(bytes: Uint8Array, extension: string): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (extension === "png" && bytes.byteLength >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if ((extension === "jpg" || extension === "jpeg") && bytes.byteLength >= 4) {
    let offset = 2
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (length < 2) break
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
      }
      offset += length + 2
    }
  }
  if (extension === "webp" && bytes.byteLength >= 30) {
    const chunk = new TextDecoder("ascii").decode(bytes.subarray(12, 16))
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
      return { width, height }
    }
    // Lossy: a 3-byte frame tag, the 9d 01 2a start code, then 14-bit sizes.
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    }
    // Lossless: a 0x2f signature, then width-1 and height-1 as 14-bit fields.
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  if (extension === "gif" && bytes.byteLength >= 10) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (extension === "svg") {
    const size = svgDimensions(bytes)
    if (size) return size
  }
  return { width: 1024, height: 1024 }
}

/** How far into an SVG to look for its root element: editors put long XML
 * comments and metadata before it. */
const SVG_HEAD_BYTES = 64 * 1024
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/** Width and height of the root `<svg>`: unitless or px `width`/`height`
 * first, then the `viewBox` size. Null when neither gives a positive size. */
function svgDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, SVG_HEAD_BYTES)))
  const tag = text.match(/<svg\b[^>]*>/i)?.[0]
  if (!tag) return null
  const attribute = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1]
  const pixels = (value: string | undefined) => {
    const match = value?.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px)?$/i)
    const number = match ? Number(match[1]) : NaN
    return number > 0 ? number : null
  }
  const round = (value: number) => Math.max(1, Math.round(value))
  const width = pixels(attribute("width"))
  const height = pixels(attribute("height"))
  if (width && height) return { width: round(width), height: round(height) }
  const box = (attribute("viewBox") ?? "").match(NUMBER)?.map(Number)
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) return { width: round(box[2]), height: round(box[3]) }
  return null
}
