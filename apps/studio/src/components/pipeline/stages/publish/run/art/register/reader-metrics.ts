import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"

/**
 * The reading miniature's geometry, resolved against the slot *and* against the book's own trim.
 *
 * The whole subject of these variants is a page with other people's cursors on it, and a square
 * picture book drawn as a 3:4 portrait is either letterboxed inside its own reader window or
 * cropped through the illustration that *is* the page. So the page box is fitted from `aspect`, and
 * everything that has to sit beside it is measured after the fit rather than before.
 *
 * Type and cursor sizes **step** rather than scale: a miniature scaled bodily down to the 160px
 * slot takes its name labels with it, and a 5px name is not a small label, it is an unreadable one.
 * The arrow steps 15 → 13 → 11 (the shipped overlay draws it at 18) and the label floors at 8px.
 *
 * The plate ladder is duplicated from `slot-metrics.ts` rather than imported, because that module
 * publishes it only as a formatted CSS string and reparsing `"44px"` to subtract it would be worse
 * than restating one clamp. If that ladder changes, change it in both places.
 */
export interface ReaderMetrics extends CSSProperties {
  "--rd-pad": string
  /** The reader window's title bar — only `room` draws one, but the fit accounts for it. */
  "--rd-bar-h": string
  "--rd-page-w": string
  "--rd-page-h": string
  /** The whole artwork band: one page tall, or one page of a spread. */
  "--rd-art-h": string
  "--rd-art-w": string
  "--rd-name": string
  "--rd-arrow": string
  /** Ambient drift amplitude, in px. Roughly 2% of the slot's short side at every step. */
  "--rd-drift": string
}

/**
 * `room` — a book inside a window with a title bar. Two pages wide, because the book in it opens.
 * `spread` — two facing leaves, no chrome at all.
 * `solo` — one page, no chrome, as large as the slot allows.
 */
export type ReaderLayout = "room" | "spread" | "solo"

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function compute(width: number, height: number, aspect: number, layout: ReaderLayout): ReaderMetrics {
  const pad = width >= 300 ? 10 : width >= 220 ? 8 : 6
  /* Mirrors `slot-metrics.ts`. See the note above. */
  const plate = width >= 300 ? 44 : width >= 220 ? 38 : 32
  const gap = 6
  const barHeight = plate + 10

  /* What the page does *not* get. Room spends it on the title bar and the window's inner margin —
     its link row lives inside that bar, so the row is already paid for. The other two spend it on
     the row beneath the artwork, and `solo` on the slim reader header above its page as well. */
  const reserved =
    layout === "room" ? barHeight + 12 : layout === "solo" ? plate + gap + 18 : plate + gap + 6
  /* `room` is two pages wide even while its book is still shut. The closed cover is the right-hand
     half of the open spread's footprint and the group slides half a page to keep it optically
     centred, so the *fit* has to be the open one from the first frame — fit the closed cover and
     the page would have to shrink as the cover swung, which is the layout jumping mid-gesture. */
  const columns = layout === "solo" ? 1 : 2
  /* Room pays for a margin on each side of the book, which the two chromeless layouts do not need:
     inside a window, a spread touching the stage edges reads as a cropped screenshot rather than as
     a book sitting in a reader. */
  const sideInset = layout === "room" ? (width >= 220 ? 28 : 24) : layout === "solo" ? 8 : 0

  const areaWidth = Math.max(40, width - pad * 2 - sideInset)
  const areaHeight = Math.max(30, height - pad * 2 - reserved)

  let pageHeight = areaHeight
  let pageWidth = pageHeight * aspect
  const widthBudget = areaWidth / columns - (columns > 1 ? 2 : 0)
  if (pageWidth > widthBudget) {
    pageWidth = widthBudget
    pageHeight = pageWidth / aspect
  }
  pageWidth = clamp(pageWidth, 22, 260)
  pageHeight = clamp(pageHeight, 22, 260)

  return {
    "--rd-pad": `${pad}px`,
    "--rd-bar-h": `${barHeight}px`,
    "--rd-page-w": `${Math.round(pageWidth)}px`,
    "--rd-page-h": `${Math.round(pageHeight)}px`,
    "--rd-art-h": `${Math.round(pageHeight)}px`,
    "--rd-art-w": `${Math.round(pageWidth * columns)}px`,
    "--rd-name": `${width >= 300 ? 10 : width >= 220 ? 9 : 8}px`,
    "--rd-arrow": `${width >= 300 ? 15 : width >= 220 ? 13 : 11}px`,
    "--rd-drift": `${width >= 300 ? 5 : width >= 220 ? 4 : 3}px`,
  }
}

export function useReaderMetrics(
  ref: RefObject<HTMLElement | null>,
  aspect: number,
  layout: ReaderLayout,
): ReaderMetrics {
  const [metrics, setMetrics] = useState<ReaderMetrics>(() => compute(320, 200, aspect, layout))
  const last = useRef("")

  useEffect(() => {
    const node = ref.current
    if (!node) return
    /* The observed node is 100% × 100% of the stage and nothing published here feeds back into its
       size, so there is no resize loop; the key guard only stops sub-pixel jitter from re-rendering
       three miniatures every frame. `aspect` is in the key because it arrives late — the first page
       render has to decode before the book's real trim is known, and without it the fit would stay
       at whatever the fallback measured. */
    const apply = (boxWidth: number, boxHeight: number) => {
      const key = `${Math.round(boxWidth)}x${Math.round(boxHeight)}x${aspect.toFixed(3)}`
      if (key === last.current) return
      last.current = key
      setMetrics(compute(boxWidth, boxHeight, aspect, layout))
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box || box.width < 1) return
      apply(box.width, box.height)
    })
    observer.observe(node)
    apply(node.clientWidth || 320, node.clientHeight || 200)
    return () => observer.disconnect()
  }, [aspect, layout, ref])

  return metrics
}
