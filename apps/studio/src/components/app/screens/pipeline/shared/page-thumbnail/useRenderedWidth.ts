import { useLayoutEffect, useState, type RefObject } from "react"

const COVER_RATIO = 1.5

export function useRenderedWidth(ref: RefObject<HTMLElement | null>, active: boolean, fit: "cover" | "contain" = "contain"): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!active || !node) return
    const measure = () => {
      const box = node.getBoundingClientRect()
      const needed = fit === "cover" ? Math.max(box.width, box.height * COVER_RATIO) : box.width
      setWidth((current) => (needed > current ? Math.round(needed) : current))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, active, fit])
  return width
}
