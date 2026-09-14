import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type Edges = "none" | "top" | "bottom" | "both"

/**
 * Which ends of a scroller have content beyond them.
 *
 * Watched rather than computed once: these panels are fed by queries that arrive after mount and
 * by a grid whose height follows the window, so the answer changes without anything being
 * clicked. `ResizeObserver` covers both the box resizing and its content growing.
 */
function useOverflowEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState<Edges>("none")

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = element
      /** A pixel of tolerance: fractional layout heights otherwise report a permanent overflow
       *  of 0.5px and leave a fade on a list that fits. */
      const above = scrollTop > 1
      const below = scrollTop + clientHeight < scrollHeight - 1
      setEdges(above && below ? "both" : above ? "top" : below ? "bottom" : "none")
    }

    measure()
    element.addEventListener("scroll", measure, { passive: true })
    if (typeof ResizeObserver === "undefined") {
      return () => element.removeEventListener("scroll", measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => {
      element.removeEventListener("scroll", measure)
      observer.disconnect()
    }
  }, [])

  return { ref, edges }
}

/** Masks matched to the edges that actually have more content, so a list that fits is never
 *  faded and a list that does not never looks like it was cut off by accident. */
/* eslint-disable lingui/no-unlocalized-strings -- Tailwind arbitrary values, not user text */
const MASK: Record<Edges, string> = {
  none: "",
  top: "[mask-image:linear-gradient(to_bottom,transparent,#000_20px)]",
  bottom: "[mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent)]",
  both: "[mask-image:linear-gradient(to_bottom,transparent,#000_20px,#000_calc(100%-20px),transparent)]",
}
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * A panel that keeps its size while its contents change.
 *
 * The dashboard's side panels are fed by lists that grow — a reader joins, a version is
 * published — and a card that resized every time would move the card below it and re-flow the
 * page. So the box owns its height from the grid, the list scrolls inside it, and the edges fade
 * to say there is more. `overscroll-contain` keeps a flick inside the list from scrolling the
 * page behind it once it reaches the end.
 */
export function ScrollBox({
  children,
  footer,
  className,
}: {
  children: ReactNode
  /** Pinned below the scroller, inside the card. A caveat that belongs with a list must not be
   *  part of what scrolls: it either gets clipped mid-sentence or, if made sticky, sits over the
   *  rows it is explaining. */
  footer?: ReactNode
  className?: string
}) {
  const { ref, edges } = useOverflowEdges<HTMLDivElement>()

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-xl border bg-card",
        className,
      )}
    >
      <div
        ref={ref}
        data-overflow={edges}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3",
          MASK[edges],
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t px-4 py-2 text-[11px] leading-4 text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
