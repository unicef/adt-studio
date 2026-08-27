import { useEffect, useState } from "react"

/**
 * Reports whether a scroller still has content below the fold.
 *
 * Kids surfaces clip mid-item when they overflow, and a young reader has no
 * way to know the rest of the list exists — every scrollable kids surface
 * pairs this with a fade + chevron affordance.
 */
export function useScrollHint(element: HTMLElement | null) {
  const [moreBelow, setMoreBelow] = useState(false)

  useEffect(() => {
    if (!element) {
      setMoreBelow(false)
      return
    }
    const update = () => {
      setMoreBelow(
        element.scrollHeight - element.clientHeight - element.scrollTop > 8,
      )
    }
    update()
    element.addEventListener("scroll", update, { passive: true })
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      element.removeEventListener("scroll", update)
      observer?.disconnect()
    }
  }, [element])

  return moreBelow
}
