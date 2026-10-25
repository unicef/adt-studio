import fs from "node:fs"
import { openPdfPageRenderer, type PdfPageRenderer } from "@adt/pdf"

const MAX_OPEN_PDFS = 2
const MAX_THUMBNAILS = 400

interface OpenPdf {
  mtimeMs: number
  renderer: PdfPageRenderer
}

const openPdfs = new Map<string, OpenPdf>()
const thumbnails = new Map<string, Buffer>()

function rendererFor(pdfPath: string, mtimeMs: number): PdfPageRenderer {
  const open = openPdfs.get(pdfPath)
  if (open && open.mtimeMs === mtimeMs) {
    openPdfs.delete(pdfPath)
    openPdfs.set(pdfPath, open)
    return open.renderer
  }
  open?.renderer.destroy()
  openPdfs.delete(pdfPath)
  const renderer = openPdfPageRenderer(fs.readFileSync(pdfPath))
  openPdfs.set(pdfPath, { mtimeMs, renderer })
  while (openPdfs.size > MAX_OPEN_PDFS) {
    const [oldest, entry] = openPdfs.entries().next().value as [string, OpenPdf]
    entry.renderer.destroy()
    openPdfs.delete(oldest)
  }
  return renderer
}

export interface SourcePdfThumbnail {
  jpeg: Buffer
  etag: string
}

export function renderSourcePdfThumbnail(pdfPath: string, pageNumber: number, width: number): SourcePdfThumbnail {
  const { mtimeMs } = fs.statSync(pdfPath)
  const etag = `"${Math.round(mtimeMs).toString(36)}-${pageNumber}-${width}"`
  const key = `${pdfPath}|${etag}`
  const cached = thumbnails.get(key)
  if (cached) return { jpeg: cached, etag }
  const renderer = rendererFor(pdfPath, mtimeMs)
  if (pageNumber > renderer.pageCount) throw new RangeError(`Page ${pageNumber} is out of range`)
  const jpeg = renderer.renderJpeg(pageNumber, width)
  thumbnails.set(key, jpeg)
  while (thumbnails.size > MAX_THUMBNAILS) {
    const oldest = thumbnails.keys().next().value as string
    thumbnails.delete(oldest)
  }
  return { jpeg, etag }
}
