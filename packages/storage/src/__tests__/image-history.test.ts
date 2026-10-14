import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "../book-storage.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-image-history-"))
  storage = createBookStorage("book", root)
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 1, height: 1 }, images: [] })
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })
function put(bytes: string) { return storage.putTranslatedImage({ sourceImageId: "pg001_im001", pageId: "pg001", languageCode: "fr", buffer: Buffer.from(bytes), width: 10, height: 10 }) }

it("restores translated image bytes and metadata after replacement, retirement and cache cleanup", () => {
  const id = put("first")
  const first = storage.getImageMeta(id)!
  const firstVersion = storage.getLatestNodeData("image-translation", id)!.version
  put("second")
  const second = storage.getImageMeta(id)!
  expect(first.relativePath).not.toBe(second.relativePath)
  storage.clearTranslatedImages({ languageCodes: ["fr"] })
  expect(storage.getImageMeta(id)).toBeNull()
  fs.rmSync(path.join(storage.bookDir!, ".cache"), { recursive: true, force: true })
  expect(storage.setCurrentNodeVersion("image-translation", id, firstVersion)).toBe(true)
  expect(storage.getImageMeta(id)).toEqual(first)
  expect(fs.readFileSync(path.join(storage.bookDir!, first.relativePath), "utf8")).toBe("first")
  expect(fs.readFileSync(path.join(storage.bookDir!, second.relativePath), "utf8")).toBe("second")
})

it("rejects corrupt historical image bytes and retains the active variant", () => {
  const id = put("first")
  const first = storage.getImageMeta(id)!
  const version = storage.getLatestNodeData("image-translation", id)!.version
  put("second")
  const current = storage.getImageMeta(id)
  fs.writeFileSync(path.join(storage.bookDir!, first.relativePath), "corrupt")
  expect(() => storage.setCurrentNodeVersion("image-translation", id, version)).toThrow("missing or changed")
  expect(storage.getImageMeta(id)).toEqual(current)
})
