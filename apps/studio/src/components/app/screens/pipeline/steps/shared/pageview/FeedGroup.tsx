import { useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react"

export interface FeedHeights {
  get: (pageId: string) => number | undefined
  set: (pageId: string, height: number) => void
  estimate: () => number
}

export function FeedGroup({
  pageId,
  header,
  near,
  pinned,
  heights,
  children,
}: {
  pageId: string
  header: ReactNode
  near: boolean
  pinned: boolean
  heights: FeedHeights
  children: ReactNode
}) {
  const section = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [height, setHeight] = useState(() => heights.get(pageId) ?? heights.estimate())
  const mounted = near || pinned || focused

  useLayoutEffect(() => {
    if (!mounted || !body.current) return
    const node = body.current
    const observer = new ResizeObserver(() => {
      const measured = node.offsetHeight
      if (!measured) return
      heights.set(pageId, measured)
      setHeight(measured)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [mounted, heights, pageId])

  useLayoutEffect(() => {
    const node = section.current
    if (!node) return
    const root = node.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
    if (!root) return
    let last = node.offsetHeight
    const observer = new ResizeObserver(() => {
      const next = node.offsetHeight
      const delta = next - last
      const previousBottom = node.getBoundingClientRect().top - root.getBoundingClientRect().top + last
      last = next
      if (delta !== 0 && previousBottom <= 0) root.scrollTop += delta
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
  }

  return (
    <section
      ref={section}
      data-feed-group={pageId}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="flex flex-col gap-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${height + 62}px` }}
    >
      {header}
      {mounted ? (
        <div ref={body} data-feed-body="">
          {children}
        </div>
      ) : (
        <div aria-hidden className="rounded-xl border border-dashed bg-muted/20" style={{ height }} />
      )}
    </section>
  )
}
