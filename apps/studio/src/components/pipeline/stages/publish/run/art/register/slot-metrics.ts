import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"

/**
 * The link row's own box, resolved against the slot it was actually given.
 *
 * The gallery renders every variant at 160×160, 240×200, 400×200 and 400×240, and the two ways of
 * surviving that are both wrong on their own. Scaling one fixed 320×200 drawing down by half takes
 * the URL with it — 5px of monospace, which is not "holding up at the small slot", it is a
 * screenshot of one. Writing the whole thing in percentages loses the plate's 44px text row, which
 * is a real product measurement.
 *
 * So the geometry is computed once per resize and published as custom properties. Type sizes step
 * rather than scale and the URL truncates — which is the honest failure mode, since a 66-character
 * link in a 140px row is the layout problem this step is *about*.
 *
 * Everything to do with the *artwork* used to live here too — a cover pinned at a fixed 112:154,
 * for the three variants that drew a book-shaped rectangle rather than the book. Those are gone,
 * and the survivors fit their pages from the book's real trim in `reader-metrics.ts`. What is left
 * is only the row, which is genuinely slot-relative and genuinely shared.
 */
export interface SlotMetrics extends CSSProperties {
  "--reg-plate-w": string
  "--reg-plate-h": string
  "--reg-url-size": string
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function compute(width: number): SlotMetrics {
  const plateHeight = width >= 300 ? 44 : width >= 220 ? 38 : 32
  const plateWidth = clamp(width - 20, 96, 264)
  const urlSize = plateHeight >= 44 ? 11 : plateHeight >= 38 ? 10 : 9

  return {
    "--reg-plate-w": `${Math.round(plateWidth)}px`,
    "--reg-plate-h": `${plateHeight}px`,
    "--reg-url-size": `${urlSize}px`,
  }
}

const FALLBACK = compute(320)

export function useSlotMetrics(ref: RefObject<HTMLElement | null>): SlotMetrics {
  const [metrics, setMetrics] = useState<SlotMetrics>(FALLBACK)
  const last = useRef("")

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box || box.width < 1) return
      /* The published values are all functions of the box, and none of them feed back into it —
         the root is 100%×100% of the stage — so there is no resize loop. The key guard is only to
         keep sub-pixel jitter from re-rendering four variants every frame. */
      const key = `${Math.round(box.width)}x${Math.round(box.height)}`
      if (key === last.current) return
      last.current = key
      setMetrics(compute(box.width))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return metrics
}
