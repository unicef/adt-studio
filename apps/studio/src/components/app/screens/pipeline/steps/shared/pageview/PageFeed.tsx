import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { FeedHeights } from "./FeedGroup"
import { useNearViewport } from "./useNearViewport"

const FEED_MARGIN = 400

export interface FeedPage {
  pageId: string
  pageNumber: number
}

export interface FeedRenderContext {
  near: boolean
  pinned: boolean
  heights: FeedHeights
  onDirtyChange: (dirty: boolean) => void
}

function FeedItem<P extends FeedPage>({
  page,
  pinned,
  heights,
  onPin,
  renderGroup,
}: {
  page: P
  pinned: boolean
  heights: FeedHeights
  onPin: (pageId: string, dirty: boolean) => void
  renderGroup: (page: P, context: FeedRenderContext) => ReactNode
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>(FEED_MARGIN)
  const onDirtyChange = useCallback((dirty: boolean) => onPin(page.pageId, dirty), [onPin, page.pageId])
  return <div ref={ref}>{renderGroup(page, { near, pinned, heights, onDirtyChange })}</div>
}

export function PageFeed<P extends FeedPage>({
  pages,
  estimate,
  renderGroup,
}: {
  pages: readonly P[]
  estimate: number
  renderGroup: (page: P, context: FeedRenderContext) => ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set())
  const measured = useRef(new Map<string, number>())
  const heights = useMemo<FeedHeights>(
    () => ({
      get: (pageId) => measured.current.get(pageId),
      set: (pageId, height) => void measured.current.set(pageId, height),
      estimate: () => {
        const known = [...measured.current.values()]
        return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : estimate
      },
    }),
    [estimate],
  )

  useEffect(() => {
    const viewport = root.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
    if (!viewport) return
    const previous = viewport.style.overflowAnchor
    viewport.style.overflowAnchor = "none"
    return () => {
      viewport.style.overflowAnchor = previous
    }
  }, [])

  const onPin = useCallback(
    (pageId: string, dirty: boolean) =>
      setPinned((previous) => {
        if (previous.has(pageId) === dirty) return previous
        const next = new Set(previous)
        if (dirty) next.add(pageId)
        else next.delete(pageId)
        return next
      }),
    [],
  )
  return (
    <div ref={root} className="flex flex-col gap-8">
      {pages.map((page) => (
        <FeedItem key={page.pageId} page={page} pinned={pinned.has(page.pageId)} heights={heights} onPin={onPin} renderGroup={renderGroup} />
      ))}
    </div>
  )
}
