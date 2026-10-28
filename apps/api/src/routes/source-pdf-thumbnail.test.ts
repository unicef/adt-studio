import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookRoutes } from "./books.js"
import { clearSourcePdfThumbnails } from "../services/source-pdf-thumbnails.js"

const MINIMAL_PDF = [
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >> endobj",
  "4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >> endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF",
].join("\n")

let tmpDir: string
let pdfPath: string

const FIXED_TIME = new Date("2026-01-01T00:00:00Z")
const LATER_TIME = new Date("2026-01-02T00:00:00Z")

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-thumbnail-route-"))
  const bookDir = path.join(tmpDir, "book")
  fs.mkdirSync(bookDir, { recursive: true })
  pdfPath = path.join(bookDir, "book.pdf")
  fs.writeFileSync(pdfPath, MINIMAL_PDF)
  fs.utimesSync(pdfPath, FIXED_TIME, FIXED_TIME)
})

afterEach(() => {
  clearSourcePdfThumbnails()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("GET /books/:label/source-pdf/pages/:page/thumbnail", () => {
  it("returns a JPEG with an ETag and honours If-None-Match", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/book/source-pdf/pages/2/thumbnail?width=100")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    const etag = res.headers.get("ETag")
    expect(etag).toBeTruthy()

    const again = await app.request("/books/book/source-pdf/pages/2/thumbnail?width=100", {
      headers: { "If-None-Match": etag ?? "" },
    })
    expect(again.status).toBe(304)
  })

  it("rejects an invalid page or width", async () => {
    const app = createBookRoutes(tmpDir)
    expect((await app.request("/books/book/source-pdf/pages/0/thumbnail")).status).toBe(400)
    expect((await app.request("/books/book/source-pdf/pages/1/thumbnail?width=10")).status).toBe(400)
  })

  it("returns 404 for a page past the end or a book without a PDF", async () => {
    const app = createBookRoutes(tmpDir)
    expect((await app.request("/books/book/source-pdf/pages/3/thumbnail")).status).toBe(404)
    expect((await app.request("/books/missing/source-pdf/pages/1/thumbnail")).status).toBe(404)
  })

  it("answers a matching If-None-Match with 304 and no body, without rendering", async () => {
    const app = createBookRoutes(tmpDir)
    const first = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=100")
    const etag = first.headers.get("ETag") ?? ""
    clearSourcePdfThumbnails()
    fs.writeFileSync(pdfPath, "not a pdf")
    fs.utimesSync(pdfPath, FIXED_TIME, FIXED_TIME)

    const again = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=100", {
      headers: { "If-None-Match": etag },
    })
    expect(again.status).toBe(304)
    expect(again.headers.get("ETag")).toBe(etag)
    expect((await again.arrayBuffer()).byteLength).toBe(0)

    const fresh = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=100")
    expect(fresh.status).toBe(500)
  })

  it("rounds the width up to the next 50px step and defaults to 300", async () => {
    const app = createBookRoutes(tmpDir)
    const snapped = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=101")
    expect(snapped.status).toBe(200)
    expect(snapped.headers.get("ETag")).toMatch(/-1-150"$/)
    const fallback = await app.request("/books/book/source-pdf/pages/1/thumbnail")
    expect(fallback.headers.get("ETag")).toMatch(/-1-300"$/)
  })

  it("rejects a bad label or a non-numeric page", async () => {
    const app = createBookRoutes(tmpDir)
    expect((await app.request("/books/bad%20label/source-pdf/pages/1/thumbnail")).status).toBe(400)
    expect((await app.request("/books/.book/source-pdf/pages/1/thumbnail")).status).toBe(400)
    expect((await app.request("/books/book/source-pdf/pages/one/thumbnail")).status).toBe(400)
  })

  it("changes the ETag when the PDF changes", async () => {
    const app = createBookRoutes(tmpDir)
    const before = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=100")
    const oldTag = before.headers.get("ETag") ?? ""
    fs.utimesSync(pdfPath, LATER_TIME, LATER_TIME)

    const after = await app.request("/books/book/source-pdf/pages/1/thumbnail?width=100", {
      headers: { "If-None-Match": oldTag },
    })
    expect(after.status).toBe(200)
    expect(after.headers.get("ETag")).not.toBe(oldTag)
  })
})
