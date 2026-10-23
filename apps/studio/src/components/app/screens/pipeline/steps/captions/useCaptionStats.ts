import { useMemo } from "react"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export type CaptionFilter = "all" | "describe" | "decorative" | "failed"

export interface CaptionStats {
  total: number
  toDescribe: number
  decorative: number
  navPages: PipelinePage[]
}

type CountedPage = Pick<PipelinePage, "pageId" | "captionCount" | "uncaptionedCount" | "decorativeCount">

export function captionStats<P extends CountedPage>(pages: readonly P[], isFailed: (pageId: string) => boolean = () => false) {
  let total = 0
  let toDescribe = 0
  let decorative = 0
  const navPages: P[] = []
  for (const page of pages) {
    total += page.captionCount
    toDescribe += page.uncaptionedCount
    decorative += page.decorativeCount
    if (page.captionCount > 0 || isFailed(page.pageId)) navPages.push(page)
  }
  return { total, toDescribe, decorative, navPages }
}

export function pageMatchesCaptionFilter(page: CountedPage, filter: CaptionFilter, isFailed: (pageId: string) => boolean): boolean {
  if (filter === "describe") return page.uncaptionedCount > 0
  if (filter === "decorative") return page.decorativeCount > 0
  if (filter === "failed") return isFailed(page.pageId)
  return true
}

export function useCaptionStats(pages: readonly PipelinePage[], isFailed?: (pageId: string) => boolean): CaptionStats {
  return useMemo(() => captionStats(pages, isFailed), [pages, isFailed])
}
