import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { Hono } from "hono"
import { createBookStorage, openBookDb } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createPageRoutes } from "./pages.js"
import { clearPageImageThumbnails } from "../services/page-image-thumbnails.js"

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let offset = 2
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1]
    const length = jpeg.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
    offset += 2 + length
  }
  throw new Error("No SOF marker")
}

const label = "thumb-book"
const pageId = `${label}_p1`
let tmpDir: string
let app: Hono

function pageImagePath(): string {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    const [row] = db.all("SELECT path FROM images WHERE image_id = ?", [`${pageId}_page`]) as Array<{ path: string }>
    return path.join(tmpDir, label, row.path)
  } finally {
    db.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "page-thumbnail-route-"))
  const configPath = path.join(tmpDir, "global-config.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putExtractedPage({
      pageId,
      pageNumber: 1,
      text: "Page one",
      pageImage: { imageId: `${pageId}_page`, buffer: solidPng(800, 600, [200, 40, 90]), format: "png", hash: "abc123", width: 800, height: 600 },
      images: [],
    })
  } finally {
    storage.close()
  }
  app = new Hono()
  app.onError(errorHandler)
  app.route("/api", createPageRoutes(tmpDir, tmpDir, tmpDir, configPath))
})

afterEach(() => {
  clearPageImageThumbnails()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("GET /api/books/:label/pages/:pageId/thumbnail", () => {
  it("returns a JPEG of the requested width with an ETag and a private cache header", async () => {
    const res = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=200`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600")
    expect(res.headers.get("ETag")).toMatch(/-200"$/)
    expect(jpegSize(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 200, height: 150 })
  })

  it("snaps the width up to the next 50px step and defaults to 300", async () => {
    const snapped = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=101`)
    expect(jpegSize(Buffer.from(await snapped.arrayBuffer())).width).toBe(150)
    const fallback = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail`)
    expect(jpegSize(Buffer.from(await fallback.arrayBuffer())).width).toBe(300)
  })

  it("answers a matching If-None-Match with 304 before rendering", async () => {
    const first = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=200`)
    const etag = first.headers.get("ETag") ?? ""
    clearPageImageThumbnails()
    const imagePath = pageImagePath()
    const { mtime } = fs.statSync(imagePath)
    const original = fs.readFileSync(imagePath)
    fs.writeFileSync(imagePath, Buffer.concat([Buffer.from("x"), original.subarray(1)]))
    fs.utimesSync(imagePath, mtime, mtime)

    const again = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=200`, { headers: { "If-None-Match": etag } })
    expect(again.status).toBe(304)
    expect(again.headers.get("ETag")).toBe(etag)
    expect((await again.arrayBuffer()).byteLength).toBe(0)
  })

  it("changes the ETag when the page image changes", async () => {
    const before = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=200`)
    const oldTag = before.headers.get("ETag") ?? ""
    const imagePath = pageImagePath()
    fs.writeFileSync(imagePath, solidPng(400, 400, [10, 200, 10]))
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(imagePath, later, later)

    const after = await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=200`, { headers: { "If-None-Match": oldTag } })
    expect(after.status).toBe(200)
    expect(after.headers.get("ETag")).not.toBe(oldTag)
    expect(jpegSize(Buffer.from(await after.arrayBuffer()))).toEqual({ width: 200, height: 200 })
  })

  it("rejects a bad label, a bad page id or an out-of-range width", async () => {
    expect((await app.request(`/api/books/bad%20label/pages/${pageId}/thumbnail`)).status).toBe(400)
    expect((await app.request(`/api/books/.hidden/pages/${pageId}/thumbnail`)).status).toBe(400)
    expect((await app.request(`/api/books/${label}/pages/..%2Fx/thumbnail`)).status).toBe(400)
    expect((await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=10`)).status).toBe(400)
    expect((await app.request(`/api/books/${label}/pages/${pageId}/thumbnail?width=5000`)).status).toBe(400)
  })

  it("returns 404 for an unknown page or book", async () => {
    expect((await app.request(`/api/books/${label}/pages/${label}_p9/thumbnail`)).status).toBe(404)
    expect((await app.request(`/api/books/missing-book/pages/${pageId}/thumbnail`)).status).toBe(404)
  })
})

describe("GET /books/:label/images/:imageId/thumbnail", () => {
  it("returns a sized JPEG for any stored image and honours If-None-Match", async () => {
    const { createBookRoutes } = await import("./books.js")
    const books = createBookRoutes(tmpDir)
    const res = await books.request(`/books/${label}/images/${pageId}_page/thumbnail?width=120`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    expect(jpegSize(Buffer.from(await res.arrayBuffer())).width).toBe(150)
    const again = await books.request(`/books/${label}/images/${pageId}_page/thumbnail?width=120`, { headers: { "If-None-Match": res.headers.get("ETag") ?? "" } })
    expect(again.status).toBe(304)
  })

  it("rejects bad ids and returns 404 for unknown images", async () => {
    const { createBookRoutes } = await import("./books.js")
    const books = createBookRoutes(tmpDir)
    expect((await books.request(`/books/${label}/images/..%2Fx/thumbnail`)).status).toBe(400)
    expect((await books.request(`/books/${label}/images/${label}_nope/thumbnail`)).status).toBe(404)
  })
})
