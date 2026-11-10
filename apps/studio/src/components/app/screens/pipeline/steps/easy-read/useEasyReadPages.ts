import { useCallback, useDeferredValue, useMemo } from "react"
import type { EasyReadSectionBlock } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { entryCount, filterBlocks, groupByPage, type EasyReadPage } from "./easyReadPages"
import { useSectionTypeLabel } from "./useSectionHeading"

export interface EasyReadFeedPage extends EasyReadPage {
  pageWidth?: number | null
  pageHeight?: number | null
}

const NO_BLOCKS: EasyReadSectionBlock[] = []

export function useEasyReadPages(pages: readonly PipelinePage[], blocks: readonly EasyReadSectionBlock[], search: string) {
  const typeLabel = useSectionTypeLabel()
  const query = useDeferredValue(search)
  const byPage = useMemo(() => new Map(groupByPage(blocks).map((page) => [page.pageId, page.blocks])), [blocks])
  const summaryOf = useMemo(() => new Map(pages.map((page) => [page.pageId, page])), [pages])
  const navPages = useMemo(() => pages.filter((page) => byPage.has(page.pageId)), [pages, byPage])
  const blocksOn = useCallback((pageId: string) => byPage.get(pageId) ?? NO_BLOCKS, [byPage])

  const matched = useMemo(() => filterBlocks(blocks, query, typeLabel), [blocks, query, typeLabel])
  const feedPages = useMemo<EasyReadFeedPage[]>(
    () =>
      groupByPage(matched).map((page) => {
        const summary = summaryOf.get(page.pageId)
        return { ...page, pageWidth: summary?.pageWidth, pageHeight: summary?.pageHeight }
      }),
    [matched, summaryOf],
  )

  return {
    navPages,
    blocksOn,
    feedPages,
    total: useMemo(() => entryCount(blocks), [blocks]),
    shown: useMemo(() => entryCount(matched), [matched]),
    searching: query.trim().length > 0,
    pending: query !== search,
  }
}

export type EasyReadPages = ReturnType<typeof useEasyReadPages>
