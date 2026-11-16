import { useEffect, useState } from "react"

export interface ViewportSize {
  width: number
  height: number
}

function read(): ViewportSize {
  if (typeof window === "undefined") return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * The window's own size, for the overlay that decides whether a peer is off-screen.
 *
 * `useAnchorPositions` already re-measures on resize, so most of the time a size change arrives
 * as a position change and this would be redundant. Not always: a window widened around
 * fixed-width centred content moves no anchor at all, the measured map compares equal, nothing
 * re-renders — and the edge markers would sit against an edge that has moved.
 */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(read)

  useEffect(() => {
    let frame: number | null = null
    const update = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        setSize((previous) => {
          const next = read()
          return previous.width === next.width && previous.height === next.height
            ? previous
            : next
        })
      })
    }

    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
    }
  }, [])

  return size
}
