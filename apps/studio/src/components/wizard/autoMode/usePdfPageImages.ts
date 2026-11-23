import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

/** Renders chosen 1-indexed pages of a local PDF to JPEG data URLs, `width` px wide. */
export function usePdfPageImages(file: File | null, pages: number[], width: number) {
  const [images, setImages] = useState<Record<number, string>>({})
  const key = pages.join(",")

  useEffect(() => {
    if (!file || pages.length === 0) return
    let cancelled = false
    const url = URL.createObjectURL(file)
    ;(async () => {
      const pdfjs = await getPdfJs()
      const pdf = await pdfjs.getDocument({ url, ...PDF_WASM_OPTIONS }).promise
      try {
        for (const n of pages) {
          if (cancelled || n < 1 || n > pdf.numPages) continue
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          if (!ctx) continue
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
          page.cleanup()
          canvas.width = 0
          if (!cancelled) setImages((prev) => ({ ...prev, [n]: dataUrl }))
        }
      } finally {
        await pdf.destroy().catch(() => {})
      }
    })().catch(() => {})
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file, key, width])

  return images
}
