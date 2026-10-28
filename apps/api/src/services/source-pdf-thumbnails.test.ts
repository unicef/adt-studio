import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  clearSourcePdfThumbnails,
  configureSourcePdfThumbnails,
  renderSourcePdfThumbnail,
  sourcePdfThumbnailStats,
} from "./source-pdf-thumbnails.js"

const MINIMAL_PDF = [
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >> endobj",
  "4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >> endobj",
  "5 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >> endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF",
].join("\n")

let tmpDir: string
let pdfPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-thumbnail-service-"))
  pdfPath = path.join(tmpDir, "book.pdf")
  fs.writeFileSync(pdfPath, MINIMAL_PDF)
})

afterEach(() => {
  clearSourcePdfThumbnails()
  configureSourcePdfThumbnails(null)
  vi.useRealTimers()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const keyFor = (page: number) => (key: string) => key.endsWith(`-${page}-100"`)

describe("source PDF thumbnail service", () => {
  it("closes an open PDF after it has been idle for the timeout", () => {
    vi.useFakeTimers()
    configureSourcePdfThumbnails({ idleCloseMs: 1000 })
    renderSourcePdfThumbnail(pdfPath, 1, 100)
    expect(sourcePdfThumbnailStats().openPdfs).toEqual([pdfPath])

    vi.advanceTimersByTime(900)
    renderSourcePdfThumbnail(pdfPath, 2, 100)
    vi.advanceTimersByTime(900)
    expect(sourcePdfThumbnailStats().openPdfs).toEqual([pdfPath])

    vi.advanceTimersByTime(200)
    expect(sourcePdfThumbnailStats().openPdfs).toEqual([])
  })

  it("evicts the least recently used thumbnail once the byte budget is exceeded", () => {
    const first = renderSourcePdfThumbnail(pdfPath, 1, 100).jpeg.byteLength
    const second = renderSourcePdfThumbnail(pdfPath, 2, 100).jpeg.byteLength
    clearSourcePdfThumbnails()
    configureSourcePdfThumbnails({ maxCacheBytes: first + second + 1 })

    renderSourcePdfThumbnail(pdfPath, 1, 100)
    renderSourcePdfThumbnail(pdfPath, 2, 100)
    renderSourcePdfThumbnail(pdfPath, 1, 100)
    renderSourcePdfThumbnail(pdfPath, 3, 100)

    const { cachedKeys, cachedBytes } = sourcePdfThumbnailStats()
    expect(cachedKeys.some(keyFor(2))).toBe(false)
    expect(cachedKeys.some(keyFor(1))).toBe(true)
    expect(cachedKeys.some(keyFor(3))).toBe(true)
    expect(cachedBytes).toBeLessThanOrEqual(first + second + 1)
  })

  it("never caches a thumbnail larger than the whole budget", () => {
    configureSourcePdfThumbnails({ maxCacheBytes: 10 })
    renderSourcePdfThumbnail(pdfPath, 1, 100)
    expect(sourcePdfThumbnailStats()).toMatchObject({ cachedBytes: 0, cachedKeys: [] })
  })
})
