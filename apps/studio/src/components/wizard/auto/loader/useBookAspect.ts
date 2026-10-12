import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/core/pdf/pdfjsLoader"

const cache = new WeakMap<File, number>()
const pending = new WeakMap<File, Promise<number>>()

export function readAspect(file: File): Promise<number> {
  const known = pending.get(file)
  if (known) return known
  const job = (async () => {
    const [pdfjs, data] = await Promise.all([getPdfJs(), file.arrayBuffer()])
    const pdf = await pdfjs.getDocument({ data, ...PDF_WASM_OPTIONS }).promise
    const page = await pdf.getPage(Math.min(2, pdf.numPages))
    const { width, height } = page.getViewport({ scale: 1 })
    await pdf.destroy().catch(() => {})
    cache.set(file, width / height)
    return width / height
  })()
  pending.set(file, job)
  return job
}

/** The shape (width ÷ height) of the book's inner pages, read once per file from the PDF and shared by every screen. Undefined until known. */
export function useBookAspect(file: File | null | undefined): number | undefined {
  const [aspect, setAspect] = useState<number | undefined>(() => (file ? cache.get(file) : undefined))
  useEffect(() => {
    if (!file) {
      setAspect(undefined)
      return
    }
    const known = cache.get(file)
    if (known !== undefined) {
      setAspect(known)
      return
    }
    let cancelled = false
    readAspect(file)
      .then((a) => {
        if (!cancelled) setAspect(a)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [file])
  return aspect
}
