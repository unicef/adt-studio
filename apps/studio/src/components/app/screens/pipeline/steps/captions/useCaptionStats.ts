import { useMemo } from "react"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export type CaptionFilter = "all" | "describe" | "captioned" | "decorative" | "failed"

export interface CaptionStats {
  total: number
  toDescribe: number
  described: number
  decorative: number
  navPages: PipelinePage[]
}

type CountedPage = Pick<PipelinePage, "pageId" | "captionCount" | "uncaptionedCount" | "decorativeCount">

function describedOn(page: CountedPage): number {
  return Math.max(0, page.captionCount - page.uncaptionedCount - page.decorativeCount)
}

export function captionStats<P extends CountedPage>(pages: readonly P[], isFailed: (pageId: string) => boolean = () => false) {
  let total = 0
  let toDescribe = 0
  let decorative = 0
  let described = 0
  const navPages: P[] = []
  for (const page of pages) {
    total += page.captionCount
    toDescribe += page.uncaptionedCount
    decorative += page.decorativeCount
    described += describedOn(page)
    if (page.captionCount > 0 || isFailed(page.pageId)) navPages.push(page)
  }
  return { total, toDescribe, described, decorative, navPages }
}

export function pageMatchesCaptionFilter(page: CountedPage, filter: CaptionFilter, isFailed: (pageId: string) => boolean): boolean {
  if (filter === "describe") return page.uncaptionedCount > 0
  if (filter === "captioned") return describedOn(page) > 0
  if (filter === "decorative") return page.decorativeCount > 0
  if (filter === "failed") return isFailed(page.pageId)
  return true
}

export function useCaptionStats(pages: readonly PipelinePage[], isFailed?: (pageId: string) => boolean): CaptionStats {
  return useMemo(() => captionStats(pages, isFailed), [pages, isFailed])
}
