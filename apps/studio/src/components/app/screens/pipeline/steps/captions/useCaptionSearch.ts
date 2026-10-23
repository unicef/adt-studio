import { useMemo } from "react"
import { useQueries, type UseQueryResult } from "@tanstack/react-query"
import type { PageDetail } from "@/api/client"
import { pageQueryOptions } from "@/hooks/use-pages"
import { matchesQuery } from "../shared/list/useListSearch"

export interface CaptionSearch {
  active: boolean
  pending: boolean
  matchesOn: (pageId: string) => number
  shown: number
}

const combine = (results: UseQueryResult<PageDetail>[]) => ({
  details: results.map((result) => result.data),
  pending: results.some((result) => result.isPending),
})

export function useCaptionSearch(label: string, pages: readonly { pageId: string }[], query: string): CaptionSearch {
  const active = query.trim().length > 0
  const { details, pending } = useQueries({
    queries: pages.map((page) => ({ ...pageQueryOptions(label, page.pageId), enabled: active })),
    combine,
  })
  return useMemo(() => {
    const byPage = new Map<string, number>()
    let shown = 0
    if (active) {
      details.forEach((detail, index) => {
        const hits = (detail?.imageCaptioning?.captions ?? []).filter((entry) => matchesQuery([entry.caption, entry.imageId], query)).length
        if (hits > 0) byPage.set(pages[index].pageId, hits)
        shown += hits
      })
    }
    return { active, pending: active && pending, matchesOn: (pageId: string) => byPage.get(pageId) ?? 0, shown }
  }, [active, query, pages, details, pending])
}
