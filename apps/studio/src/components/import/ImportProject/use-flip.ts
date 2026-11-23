import { useLayoutEffect, useRef, type RefObject } from "react"

/**
 * Glide elements marked with `data-flip="<name>"` from their previous position
 * to the new one after a re-render (the FLIP technique). Elements whose
 * position did not change are left alone, so a state change only moves what
 * actually moved. Skipped when the user asked for reduced motion.
 */
export function useFlip(container: RefObject<HTMLElement | null>, version: unknown, durationMs = 320) {
  const rects = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not user-visible copy.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const next = new Map<string, number>()
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((element) => {
      const name = element.dataset.flip ?? ""
      const top = element.getBoundingClientRect().top
      next.set(name, top)
      const previous = rects.current.get(name)
      const dy = previous === undefined ? 0 : previous - top
      if (!reduce && Math.abs(dy) > 0.5 && typeof element.animate === "function") {
        element.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
          // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS easing function, not user-visible copy.
          { duration: durationMs, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        )
      }
    })
    rects.current = next
  }, [container, version, durationMs])
}
