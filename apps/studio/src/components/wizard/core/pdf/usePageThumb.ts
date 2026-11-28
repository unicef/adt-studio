import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/core/pdf/pdfjsLoader"

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

/** Releases the open document (Add Book closing); the next thumbnail opens its PDF again. */
export function releasePageThumbs() {
  const previous = open
  open = null
  void previous?.doc.then((d) => d.destroy()).catch(() => {})
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
    // A failed render (a damaged PDF, a document released mid-render) isn't kept: the next ask tries again.
    const failed = src
    const entries = cache
    failed.catch(() => {
      if (entries.get(key) === failed) entries.delete(key)
    })
    if (cache.size > MAX_THUMBS) cache.delete(cache.keys().next().value as string)
  }
  return src
}

/**
 * One page of the PDF as an image (`width` CSS px, drawn at twice that), for the cover, the pages a
 * range starts and ends on, the PDF viewer and the screens' previews: one renderer and one open
 * document for all of them. Renders are debounced while a slider is dragged and the most recent
 * ones are kept; the last image of the same PDF stays until the next one is ready, so nothing
 * flickers (another PDF starts with none).
 */
export function usePageThumb(file: File | null | undefined, page: number, width = 64): string | undefined {
  const [shown, setShown] = useState<{ file: File; src: string }>()
  useEffect(() => {
    if (!file || page < 1) return
    let cancelled = false
    const id = window.setTimeout(() => {
      renderThumb(file, page, width).then(
        (src) => {
          if (!cancelled && src) setShown({ file, src })
        },
        // Nothing to show: the page keeps its placeholder (the PDF's own error is shown elsewhere).
        () => {},
      )
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [file, page, width])
  return file && shown?.file === file ? shown.src : undefined
}
