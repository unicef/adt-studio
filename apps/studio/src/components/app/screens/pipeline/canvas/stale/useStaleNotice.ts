import { useMemo } from "react"
import type { PageRebuild } from "@/components/app/screens/pipeline/runs/usePageRebuild"
import type { StageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import type { StoryboardStaleness } from "@/components/app/screens/pipeline/runs/useStoryboardStaleness"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface StaleNotice {
  rerun: StageRerun
  rebuild: PageRebuild
  page: PipelinePage | null
  pageOutdated: boolean
  pageRebuilding: boolean
  outdatedIds: string[]
  rebuildingCount: number
  nextId: string | null
  onSelectPage: (pageId: string) => void
}

export function useStaleNotice({
  pages,
  page,
  staleness,
  rerun,
  rebuild,
  onSelectPage,
}: {
  pages: PipelinePage[]
  page: PipelinePage | null
  staleness: StoryboardStaleness
  rerun: StageRerun
  rebuild: PageRebuild
  onSelectPage: (pageId: string) => void
}): StaleNotice {
  const pageId = page?.pageId ?? null
  return useMemo(() => {
    const outdatedIds = pages.filter((p) => staleness.outdatedPageIds.has(p.pageId)).map((p) => p.pageId)
    const current = pages.findIndex((p) => p.pageId === pageId)
    const after = outdatedIds.filter((id) => pages.findIndex((p) => p.pageId === id) > current)
    const nextId = [...after, ...outdatedIds].find((id) => id !== pageId) ?? null
    return {
      rerun,
      rebuild,
      page,
      pageOutdated: !!pageId && staleness.outdatedPageIds.has(pageId),
      pageRebuilding: !!pageId && rebuild.rebuilding.has(pageId),
      outdatedIds,
      rebuildingCount: outdatedIds.filter((id) => rebuild.rebuilding.has(id)).length,
      nextId,
      onSelectPage,
    }
  }, [pages, page, pageId, staleness.outdatedPageIds, rerun, rebuild, onSelectPage])
}
