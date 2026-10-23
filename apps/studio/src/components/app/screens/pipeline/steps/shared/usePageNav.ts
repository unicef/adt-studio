import { useMemo } from "react"
import { usePageDetailKeys } from "./usePageDetailKeys"
import { useDetailFocus, usePageParam } from "./usePageParam"
import { usePrefetchAdjacentPages } from "./usePrefetchAdjacentPages"

export interface PageNav<P> {
  pageParam: string | null
  selected: P | null
  index: number
  prevId: string | null
  nextId: string | null
  open: (pageId: string) => void
  step: (pageId: string) => void
  close: () => void
}

export function usePageNav<P extends { pageId: string }>({
  label,
  slug,
  pages: navigable,
  allPages,
}: {
  label: string
  slug: string
  pages: readonly P[]
  allPages?: readonly P[]
}): PageNav<P> {
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, slug)
  useDetailFocus(pageParam)

  const pages = useMemo(() => {
    if (!pageParam || !allPages || navigable.some((page) => page.pageId === pageParam)) return navigable
    if (!allPages.some((page) => page.pageId === pageParam)) return navigable
    const keep = new Set([...navigable.map((page) => page.pageId), pageParam])
    return allPages.filter((page) => keep.has(page.pageId))
  }, [navigable, allPages, pageParam])

  const index = useMemo(
    () => (pageParam ? pages.findIndex((page) => page.pageId === pageParam) : -1),
    [pages, pageParam],
  )
  const selected = index >= 0 ? pages[index] : null
  const prevId = index > 0 ? pages[index - 1].pageId : null
  const nextId = index >= 0 && index < pages.length - 1 ? pages[index + 1].pageId : null

  usePageDetailKeys({ enabled: !!selected, prevPageId: prevId, nextPageId: nextId, onStep: stepPage, onClose: closeDetail })
  usePrefetchAdjacentPages(label, prevId, nextId)

  return { pageParam, selected, index, prevId, nextId, open: openPage, step: stepPage, close: closeDetail }
}
