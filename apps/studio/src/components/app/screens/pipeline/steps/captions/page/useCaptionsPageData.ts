import { useMemo } from "react"
import { usePage, usePages } from "@/hooks/use-pages"
import { lowResThumbnail, pageViewThumbnailUrl } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"
import { usePrefetchAdjacentPages } from "../../shared/usePrefetchAdjacentPages"
import type { ImageBounds, PageBox, PageSize } from "../../shared/page-inspector/types"
import { useCaptionEdits } from "../useCaptionEdits"

function baseImageId(imageId: string): string | null {
  const next = imageId.replace(/_crop\d+$/, "")
  return next === imageId ? null : next
}

function boundsFor(imageId: string, byId: ReadonlyMap<string, ImageBounds | undefined>): ImageBounds | undefined {
  let current: string | null = imageId
  while (current) {
    const bounds = byId.get(current)
    if (bounds) return bounds
    current = baseImageId(current)
  }
  return undefined
}

export function useCaptionsPageData(
  label: string,
  pageId: string,
  prevPageId: string | null,
  nextPageId: string | null,
  locked: boolean,
  accent?: string,
) {
  const query = usePage(label, pageId)
  const page = query.data
  const summary = usePages(label, { enabled: false }).data?.find((candidate) => candidate.pageId === pageId)
  const edits = useCaptionEdits(label, pageId, page, locked, undefined, accent)
  usePrefetchAdjacentPages(label, prevPageId, nextPageId)

  const meta = page?.imagesMeta
  const boundsById = useMemo(() => new Map((meta ?? []).map((entry) => [entry.imageId, entry.bounds])), [meta])
  const pageMeta = meta?.find((entry) => entry.imageId === `${pageId}_page`)
  const pageSize: PageSize | null =
    pageMeta?.width && pageMeta.height
      ? { w: pageMeta.width, h: pageMeta.height }
      : summary?.pageWidth && summary.pageHeight
        ? { w: summary.pageWidth, h: summary.pageHeight }
        : null

  const numberOf = useMemo(() => new Map(edits.items.map((entry, index) => [entry.imageId, index + 1])), [edits.items])
  const boxes = useMemo<PageBox[]>(
    () => edits.items.map((entry, index) => ({ imageId: entry.imageId, number: index + 1, bounds: boundsFor(entry.imageId, boundsById) })),
    [edits.items, boundsById],
  )

  return {
    query,
    page,
    summary,
    edits,
    boxes,
    numberOf,
    pageSize,
    pageSrc: pageViewThumbnailUrl(label, pageId),
    lowSrc: lowResThumbnail(label, pageId),
  }
}

export type CaptionsPageData = ReturnType<typeof useCaptionsPageData>
