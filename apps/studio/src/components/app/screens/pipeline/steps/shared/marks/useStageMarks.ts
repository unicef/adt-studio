import { useMemo } from "react"
import type { DescribedProblem } from "../problems/useDescribeProblem"

export interface StageMarks {
  failedPageIds: ReadonlySet<string>
  failedCount: number
  isFailed: (pageId: string) => boolean
}

const NONE: ReadonlySet<string> = new Set()

export function stageMarks<P extends { pageId: string }>(
  enabled: boolean,
  problem: DescribedProblem | null,
  pages: readonly P[],
  extra?: (page: P) => boolean,
): StageMarks {
  if (!enabled || !problem) return { failedPageIds: NONE, failedCount: 0, isFailed: () => false }
  const ids = new Set(problem.pages.map((page) => page.pageId))
  if (extra) for (const page of pages) if (extra(page)) ids.add(page.pageId)
  return { failedPageIds: ids, failedCount: ids.size, isFailed: (pageId) => ids.has(pageId) }
}

export function useStageMarks<P extends { pageId: string }>({
  enabled,
  problem,
  pages,
  extra,
}: {
  enabled: boolean
  problem: DescribedProblem | null
  pages: readonly P[]
  extra?: (page: P) => boolean
}): StageMarks {
  return useMemo(() => stageMarks(enabled, problem, pages, extra), [enabled, problem, pages, extra])
}
