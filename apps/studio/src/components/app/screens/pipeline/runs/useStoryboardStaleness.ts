import { useMemo } from "react"
import { useBookRun } from "@/hooks/use-book-run"
import {
  isPageOutdated,
  isStoryboardInvalidated,
} from "@/components/app/screens/pipeline/shared/staleness"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface StoryboardStaleness {
  /** Renderings exist but no longer match the sections they were built from. */
  isStale: boolean
  outdatedPageIds: ReadonlySet<string>
  outdatedCount: number
}

const NO_PAGES: ReadonlySet<string> = new Set()

/**
 * Whether the storyboard on screen is behind its sections. Runs in flight are
 * never stale — the run is what resolves it — and a cold step-status cache is
 * treated as fresh so a legitimate storyboard never flashes a stale warning
 * while the first status fetch is still on the wire.
 */
export function useStoryboardStaleness(pages: PipelinePage[]): StoryboardStaleness {
  const { stageState, isStatusLoading } = useBookRun()
  const storyboardState = stageState("storyboard")

  return useMemo(() => {
    const inFlight = storyboardState === "running" || storyboardState === "queued"
    if (inFlight || isStatusLoading) {
      return { isStale: false, outdatedPageIds: NO_PAGES, outdatedCount: 0 }
    }
    const outdated = pages.filter(isPageOutdated)
    const invalidated = isStoryboardInvalidated(
      pages.some((page) => page.hasRendering),
      storyboardState,
    )
    return {
      isStale: invalidated || outdated.length > 0,
      outdatedPageIds: new Set(outdated.map((page) => page.pageId)),
      outdatedCount: outdated.length,
    }
  }, [pages, storyboardState, isStatusLoading])
}
