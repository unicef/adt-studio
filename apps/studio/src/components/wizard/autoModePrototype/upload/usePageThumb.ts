import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

type PdfJs = Awaited<ReturnType<typeof getPdfJs>>
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>

const docs = new WeakMap<File, Promise<Doc>>()
const thumbs = new WeakMap<File, Map<string, Promise<string>>>()

function openDoc(file: File): Promise<Doc> {
  let doc = docs.get(file)
  if (!doc) {
    doc = Promise.all([getPdfJs(), file.arrayBuffer()]).then(([pdfjs, data]) => pdfjs.getDocument({ data, ...PDF_WASM_OPTIONS }).promise)
    docs.set(file, doc)
  }
  return doc
}

function renderThumb(file: File, n: number, width: number): Promise<string> {
  let cache = thumbs.get(file)
  if (!cache) {
    cache = new Map()
    thumbs.set(file, cache)
  }
  const key = `${n}@${width}`
  let src = cache.get(key)
  if (!src) {
    src = openDoc(file).then(async (doc) => {
      const page = await doc.getPage(Math.min(Math.max(1, n), doc.numPages))
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (width * 2) / base.width })
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext("2d")
      if (!ctx) return ""
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      page.cleanup()
      return canvas.toDataURL("image/jpeg", 0.85)
    })
    cache.set(key, src)
  }
  return src
}

/**
 * One page of the PDF as a small image, for showing which pages a range starts and ends on. Renders
 * are cached per page and debounced while a slider is dragged; the last image stays until the next
 * one is ready, so nothing flickers.
 */
export function usePageThumb(file: File | null | undefined, page: number, width = 64): string | undefined {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    if (!file || page < 1) return
    let cancelled = false
    const id = window.setTimeout(() => {
      void renderThumb(file, page, width).then((next) => {
        if (!cancelled && next) setSrc(next)
      })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [file, page, width])
  return src
}
