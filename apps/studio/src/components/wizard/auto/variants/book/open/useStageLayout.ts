import { useEffect, useState } from "react"
import { getCachedPdfPageCount, getPdfPageCount } from "@/components/wizard/core/pdf/pdfMetadata"
import { COVER } from "../book/OpenBook"

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return size
}

export const WIDE_FROM = 1080
const TABS_W = 230
const GUTTER = 48

/**
 * How the open book fits the window. Wide: notes in a margin column on the left, bookmarks out of
 * the book's right edge. Narrow: bookmarks out of its top edge and notes under it. Below 700 px, or
 * for a landscape PDF, one page at a time.
 */
export function useStageLayout(aspect: number) {
  const { w, h } = useViewport()
  const wide = w >= WIDE_FROM
  const single = aspect > 1.05 || w < 700
  const perView = single ? 1 : 2
  const railW = wide ? Math.round(Math.min(360, Math.max(290, w * 0.23))) : 0
  const availW = (wide ? w - GUTTER - railW - 40 - TABS_W : w - 32) - COVER * 2 - (single ? 6 : 0)
  const availH = wide ? Math.max(300, Math.min(560, h - 48 - 150 - 210)) : Math.max(260, Math.min(500, h * 0.46))
  const pageH = Math.floor(Math.min(availH, availW / perView / aspect))
  const pageW = Math.floor(pageH * aspect)
  return { wide, single, pageW, pageH, railW, tabsW: wide ? TABS_W : 0 }
}

/** The PDF's page count, from the upload step's cache when it has it. */
export function usePageCount(file: File | null | undefined) {
  const [count, setCount] = useState(() => (file ? getCachedPdfPageCount(file) ?? 0 : 0))
  useEffect(() => {
    if (!file) return setCount(0)
    const cached = getCachedPdfPageCount(file)
    if (cached !== undefined) return setCount(cached)
    let cancelled = false
    getPdfPageCount(file)
      .then((n) => !cancelled && setCount(n))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [file])
  return count
}
