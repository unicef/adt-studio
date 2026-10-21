import fs from "node:fs"
import { HTTPException } from "hono/http-exception"
import { applyCrop } from "@adt/pipeline"
import type { Storage } from "@adt/storage"
import type { ImageCleanupRequest } from "@adt/types"
import { resolvePathWithin } from "../utils/path-security.js"

/** Read only book-owned images; current-image removal needs no original page render. */
export function prepareCleanupSource(storage: Storage, booksDir: string, label: string, pageId: string, input: ImageCleanupRequest) {
  const current = input.inputSource === "current-image"
  if (current && input.operation !== "remove-background") {
    throw new HTTPException(400, { message: "Generative cleanup requires a selected page region" })
  }
  const imageId = current ? input.sourceImageId : `${pageId}_page`
  const meta = storage.getImageMeta(imageId)
  if (!meta) throw new HTTPException(404, { message: "Source image not found" })
  const filePath = resolvePathWithin(booksDir, label, meta.relativePath)
  if (!filePath) throw new HTTPException(400, { message: "Invalid book image path" })
  if (!fs.existsSync(filePath)) throw new HTTPException(404, { message: "Source image file not found" })
  if (current && fs.statSync(filePath).size > 5 * 1024 * 1024) throw new HTTPException(400, { message: "Background removal accepts images up to 5 MB" })
  const bytes = fs.readFileSync(filePath)
  const png = bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
  if (current) {
    const source = storage.getPageImages(pageId).find((image) => image.imageId === imageId)
    if (!source || (!png && bytes.subarray(0, 2).toString("hex") !== "ffd8")) {
      throw new HTTPException(400, { message: "Background removal requires a PNG or JPEG image" })
    }
    return { bytes, mimeType: png ? "image/png" : "image/jpeg", width: source.width, height: source.height, bounds: source.bounds }
  }
  if (!png) throw new HTTPException(400, { message: "Cleanup requires a PNG page render" })
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const { region } = input
  if (!region || width * height > 64_000_000 || region.x + region.width > width || region.y + region.height > height) {
    throw new HTTPException(400, { message: "Crop must fit inside the page image" })
  }
  return {
    bytes: applyCrop(bytes, { cropLeft: region.x, cropTop: region.y, cropRight: region.x + region.width, cropBottom: region.y + region.height }),
    mimeType: "image/png", width: region.width, height: region.height,
    bounds: { x: region.x / 2, y: region.y / 2, width: region.width / 2, height: region.height / 2 },
  }
}
