import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

type PdfJs = Awaited<ReturnType<typeof getPdfJs>>
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>

const MAX_THUMBS = 24

let open: { file: File; doc: Promise<Doc> } | null = null
const thumbs = new WeakMap<File, Map<string, Promise<string>>>()

/** One pdf.js document at a time: opening another book's PDF releases the previous one. */
function openDoc(file: File): Promise<Doc> {
  if (open?.file === file) return open.doc
  const previous = open
  const doc = Promise.all([getPdfJs(), file.arrayBuffer()]).then(([pdfjs, data]) => pdfjs.getDocument({ data, ...PDF_WASM_OPTIONS }).promise)
  open = { file, doc }
  void previous?.doc.then((d) => d.destroy()).catch(() => {})
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
  if (src) {
    cache.delete(key)
    cache.set(key, src)
  } else {
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
      const url = canvas.toDataURL("image/jpeg", 0.85)
      canvas.width = 0
      canvas.height = 0
      return url
    })
    cache.set(key, src)
    if (cache.size > MAX_THUMBS) cache.delete(cache.keys().next().value as string)
  }
  return src
}

/**
 * One page of the PDF as a small image, for showing which pages a range starts and ends on. Renders
 * are debounced while a slider is dragged and the most recent ones are kept; the last image stays
 * until the next one is ready, so nothing flickers.
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
