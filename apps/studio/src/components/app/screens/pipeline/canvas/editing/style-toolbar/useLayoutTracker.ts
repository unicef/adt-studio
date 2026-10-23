import { useEffect, useRef } from "react"

const BURST_MS = 360

export function useLayoutTracker(
  measure: () => void,
  {
    enabled,
    observe,
    scrollRoot,
    resetKey,
  }: { enabled: boolean; observe: () => Array<Element | null>; scrollRoot: Element | null; resetKey: string },
) {
  const measureRef = useRef(measure)
  measureRef.current = measure
  const observeRef = useRef(observe)
  observeRef.current = observe

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let until = 0
    const tick = () => {
      measureRef.current()
      frame = performance.now() < until ? requestAnimationFrame(tick) : 0
    }
    const burst = () => {
      until = performance.now() + BURST_MS
      if (!frame) frame = requestAnimationFrame(tick)
    }
    measureRef.current()
    burst()
    const resize = new ResizeObserver(burst)
    for (const node of observeRef.current()) if (node) resize.observe(node)
    scrollRoot?.addEventListener("scroll", burst, { capture: true, passive: true })
    scrollRoot?.addEventListener("transitionrun", burst)
    scrollRoot?.addEventListener("transitionend", burst)
    window.addEventListener("resize", burst)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      scrollRoot?.removeEventListener("scroll", burst, { capture: true })
      scrollRoot?.removeEventListener("transitionrun", burst)
      scrollRoot?.removeEventListener("transitionend", burst)
      window.removeEventListener("resize", burst)
    }
  }, [enabled, scrollRoot, resetKey])
}
