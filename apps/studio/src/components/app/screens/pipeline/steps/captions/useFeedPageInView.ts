import { useEffect, useState } from "react"

export function useFeedPageInView(active: boolean, pages: ReadonlyArray<{ pageId: string; pageNumber: number }>): number | null {
  const [current, setCurrent] = useState<number | null>(null)
  useEffect(() => {
    if (!active) return
    const numberOf = new Map(pages.map((page) => [page.pageId, page.pageNumber]))
    let frame = 0
    const measure = () => {
      frame = 0
      const line = window.innerHeight * 0.3
      let best: { id: string; top: number } | null = null
      for (const node of document.querySelectorAll<HTMLElement>("[data-feed-group]")) {
        const top = node.getBoundingClientRect().top
        const id = node.dataset.feedGroup
        if (!id) continue
        if (top <= line && (!best || top > best.top)) best = { id, top }
      }
      setCurrent(best ? (numberOf.get(best.id) ?? null) : (pages[0]?.pageNumber ?? null))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active, pages])
  return active ? current : null
}
