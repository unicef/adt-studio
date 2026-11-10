import { useEffect, useState, type RefObject } from "react"

export function useQuizInView(container: RefObject<HTMLElement | null>, active: boolean, listKey: string): string | null {
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    let frame = 0
    const measure = () => {
      frame = 0
      const root = container.current
      if (!root) return
      const line = window.innerHeight * 0.35
      let best: { key: string; top: number } | null = null
      let first: string | null = null
      for (const node of root.querySelectorAll<HTMLElement>("[data-row-key]")) {
        const key = node.dataset.rowKey
        if (!key) continue
        first ??= key
        const top = node.getBoundingClientRect().top
        if (top <= line && (!best || top > best.top)) best = { key, top }
      }
      setCurrent(best?.key ?? first)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [container, active, listKey])
  return active ? current : null
}
