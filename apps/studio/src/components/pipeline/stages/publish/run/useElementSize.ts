import { useEffect, useState, type RefObject } from "react"

export interface ElementSize {
  width: number
  height: number
}

/**
 * The measured box of an element, or nulls until it has one.
 *
 * Null rather than zero on the first pass matters: a grid told it has 0×0 to work with would
 * conclude it cannot fit and hand the screen to approach B before the browser has laid anything
 * out, and that decision is deliberately one-way.
 *
 * Resize only. Nothing here may re-run on a progress event — the column count is fixed for the
 * life of a run precisely so that no tile ever moves while the author is watching it.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof ResizeObserver === "undefined") {
      setSize({ width: element.clientWidth, height: element.clientHeight })
      return
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      setSize((current) =>
        current && current.width === box.width && current.height === box.height
          ? current
          : { width: box.width, height: box.height },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
