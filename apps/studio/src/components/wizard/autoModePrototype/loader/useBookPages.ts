import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

/**
 * Renders a run of real, consecutive PDF pages (from `first`, up to `count`) to JPEG thumbnails in
 * the browser, one after another, so the open book can flip through the actual book in order.
 */
export function useBookPages(file: File | null | undefined, { first = 2, count = 16, width = 460 } = {}) {
  const [pages, setPages] = useState<Record<number, string>>({})
  const [numPages, setNumPages] = useState(0)
  const [aspect, setAspect] = useState(0.72)

  useEffect(() => {
    setPages({})
    setNumPages(0)
    if (!file) return
    let cancelled = false
    ;(async () => {
      const [pdfjs, data] = await Promise.all([getPdfJs(), file.arrayBuffer()])
      if (cancelled) return
      const pdf = await pdfjs.getDocument({ data, ...PDF_WASM_OPTIONS }).promise
      if (cancelled) return void pdf.destroy()
      setNumPages(pdf.numPages)
      const start = Math.min(first, pdf.numPages)
      const end = Math.min(pdf.numPages, start + count - 1)
      for (let n = start; n <= end && !cancelled; n++) {
        const page = await pdf.getPage(n)
        const base = page.getViewport({ scale: 1 })
        if (n === start) setAspect(base.width / base.height)
        const viewport = page.getViewport({ scale: width / base.width })
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) break
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        if (cancelled) break
        const src = canvas.toDataURL("image/jpeg", 0.88)
        setPages((prev) => ({ ...prev, [n]: src }))
        page.cleanup()
        canvas.width = 0
      }
      await pdf.destroy().catch(() => {})
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [file, first, count, width])

  return { pages, numPages, aspect }
}
