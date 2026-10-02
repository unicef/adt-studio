import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

export interface SampledPage {
  pageNumber: number
  src: string
  aspect: number
}

/** Start, middle and end — the same parts of the book the AI samples. */
export function pickSampleIndexes(numPages: number, count = 3): number[] {
  if (numPages <= count) return Array.from({ length: numPages }, (_, i) => i + 1)
  const anchors = count === 1 ? [0.5] : Array.from({ length: count }, (_, i) => 0.15 + (0.7 * i) / (count - 1))
  const picked = anchors.map((a) => Math.min(numPages, Math.max(1, Math.round(a * numPages))))
  return [...new Set(picked)]
}

/** Renders a few sampled pages of a PDF to small JPEG thumbnails, in the browser. */
export function useSampledPages(file: File | null | undefined, { count = 3, width = 260 } = {}) {
  const [pages, setPages] = useState<SampledPage[]>([])
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!file) {
      setPages([])
      setNumPages(0)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setPages([])
    setIsLoading(true)
    ;(async () => {
      try {
        const [pdfjs, data] = await Promise.all([getPdfJs(), file.arrayBuffer()])
        if (cancelled) return
        const pdf = await pdfjs.getDocument({ data, ...PDF_WASM_OPTIONS }).promise
        if (cancelled) return void pdf.destroy()
        setNumPages(pdf.numPages)
        const out: SampledPage[] = []
        for (const pageNumber of pickSampleIndexes(pdf.numPages, count)) {
          const page = await pdf.getPage(pageNumber)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          if (!ctx) break
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          if (cancelled) break
          out.push({ pageNumber, src: canvas.toDataURL("image/jpeg", 0.9), aspect: base.width / base.height })
          page.cleanup()
          canvas.width = 0
          setPages([...out])
        }
        await pdf.destroy().catch(() => {})
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [file, count, width])

  return { pages, numPages, isLoading }
}
