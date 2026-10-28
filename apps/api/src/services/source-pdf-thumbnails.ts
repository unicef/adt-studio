import fs from "node:fs"
import { openPdfPageRenderer, type PdfPageRenderer } from "@adt/pdf"

const MAX_OPEN_PDFS = 2
const DEFAULT_LIMITS = { maxCacheBytes: 32 * 1024 * 1024, idleCloseMs: 60_000 }

let limits = { ...DEFAULT_LIMITS }

interface OpenPdf {
  mtimeMs: number
  renderer: PdfPageRenderer
  timer: ReturnType<typeof setTimeout>
}

const openPdfs = new Map<string, OpenPdf>()
const thumbnails = new Map<string, Buffer>()
let cachedBytes = 0

function closePdf(pdfPath: string): void {
  const open = openPdfs.get(pdfPath)
  if (!open) return
  clearTimeout(open.timer)
  open.renderer.destroy()
  openPdfs.delete(pdfPath)
}

function idleTimer(pdfPath: string): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => closePdf(pdfPath), limits.idleCloseMs)
  timer.unref?.()
  return timer
}

function rendererFor(pdfPath: string, mtimeMs: number): PdfPageRenderer {
  const open = openPdfs.get(pdfPath)
  if (open && open.mtimeMs === mtimeMs) {
    clearTimeout(open.timer)
    openPdfs.delete(pdfPath)
    openPdfs.set(pdfPath, { ...open, timer: idleTimer(pdfPath) })
    return open.renderer
  }
  closePdf(pdfPath)
  const renderer = openPdfPageRenderer(fs.readFileSync(pdfPath))
  openPdfs.set(pdfPath, { mtimeMs, renderer, timer: idleTimer(pdfPath) })
  while (openPdfs.size > MAX_OPEN_PDFS) {
    closePdf(openPdfs.keys().next().value as string)
  }
  return renderer
}

function readCached(key: string): Buffer | undefined {
  const jpeg = thumbnails.get(key)
  if (!jpeg) return undefined
  thumbnails.delete(key)
  thumbnails.set(key, jpeg)
  return jpeg
}

function storeCached(key: string, jpeg: Buffer): void {
  if (jpeg.byteLength > limits.maxCacheBytes) return
  thumbnails.set(key, jpeg)
  cachedBytes += jpeg.byteLength
  while (cachedBytes > limits.maxCacheBytes) {
    const [oldest, evicted] = thumbnails.entries().next().value as [string, Buffer]
    thumbnails.delete(oldest)
    cachedBytes -= evicted.byteLength
  }
}

export interface SourcePdfThumbnailTag {
  etag: string
  mtimeMs: number
}

export function sourcePdfThumbnailTag(pdfPath: string, pageNumber: number, width: number): SourcePdfThumbnailTag {
  const { mtimeMs } = fs.statSync(pdfPath)
  return { etag: `"${Math.round(mtimeMs).toString(36)}-${pageNumber}-${width}"`, mtimeMs }
}

export interface SourcePdfThumbnail {
  jpeg: Buffer
  etag: string
}

export function renderSourcePdfThumbnail(
  pdfPath: string,
  pageNumber: number,
  width: number,
  tag: SourcePdfThumbnailTag = sourcePdfThumbnailTag(pdfPath, pageNumber, width),
): SourcePdfThumbnail {
  const { etag, mtimeMs } = tag
  const key = `${pdfPath}|${etag}`
  const cached = readCached(key)
  if (cached) return { jpeg: cached, etag }
  const renderer = rendererFor(pdfPath, mtimeMs)
  if (pageNumber > renderer.pageCount) throw new RangeError(`Page ${pageNumber} is out of range`)
  const jpeg = renderer.renderJpeg(pageNumber, width)
  storeCached(key, jpeg)
  return { jpeg, etag }
}

export function clearSourcePdfThumbnails(): void {
  for (const pdfPath of [...openPdfs.keys()]) closePdf(pdfPath)
  thumbnails.clear()
  cachedBytes = 0
}

export function configureSourcePdfThumbnails(next: Partial<typeof DEFAULT_LIMITS> | null): void {
  limits = { ...DEFAULT_LIMITS, ...next }
}

export interface SourcePdfThumbnailStats {
  cachedBytes: number
  cachedKeys: string[]
  openPdfs: string[]
}

export function sourcePdfThumbnailStats(): SourcePdfThumbnailStats {
  return { cachedBytes, cachedKeys: [...thumbnails.keys()], openPdfs: [...openPdfs.keys()] }
}
