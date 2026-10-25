import { useEffect, useRef, useState } from "react"

const PAGE_RATIO = 650 / 812
const VISIBLE_ROWS = 3.4
const MIN_WIDTH = 140
const MAX_WIDTH = 300
export const CANVAS_GAP = 16
export const CANVAS_ROWS = 4
const PAD_X = 64
const PAD_TOP = 32

export function fitColumns(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 6
  const target = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ((height - CANVAS_GAP * (VISIBLE_ROWS - 1)) / VISIBLE_ROWS) * PAGE_RATIO))
  return Math.max(2, Math.floor((width + CANVAS_GAP) / (target + CANVAS_GAP)))
}

export function useCanvasFit<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [cols, setCols] = useState(6)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setCols(fitColumns(entry.contentRect.width - PAD_X, entry.contentRect.height - PAD_TOP)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, cols }
}
