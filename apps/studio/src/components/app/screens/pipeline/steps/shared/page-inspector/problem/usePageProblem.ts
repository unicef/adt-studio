import { useLingui } from "@lingui/react/macro"
import { FileWarning, type LucideIcon } from "lucide-react"
import type { ProblemAction } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemNotice"
import type { ProblemRetry } from "@/components/app/screens/pipeline/steps/shared/problems/FoldedProblem"
import type { DescribedProblem, ProblemLevel } from "@/components/app/screens/pipeline/steps/shared/problems/useDescribeProblem"
import { problemIcon, useProblemAction } from "@/components/app/screens/pipeline/steps/shared/problems/useProblemAction"

export interface PageProblem {
  scope: "stage" | "page"
  level: ProblemLevel
  icon: LucideIcon
  title: string
  body: string
  details: string | null
  action?: ProblemAction
}

function pageIdsOf(pageId: string): string[] {
  const groups = pageId.slice(2).match(/\d{3}/g) ?? []
  return [pageId, ...groups.map((group) => `pg${group}`)]
}

function linesFor(details: string | null, pageId: string): string | null {
  if (!details) return null
  const ids = pageIdsOf(pageId)
  const lines = details.split("\n").filter((line) => line.match(/\bpg\d{3,}\b/g)?.some((found) => ids.includes(found)))
  return lines.length > 0 ? lines.join("\n") : details
}

export function usePageProblem({
  label,
  problem,
  pageId,
  pageNumber,
  retry,
}: {
  label: string
  problem: DescribedProblem | null
  pageId: string
  pageNumber: number
  retry?: ProblemRetry
}): PageProblem | null {
  const { t } = useLingui()
  const actionFor = useProblemAction(label)
  if (!problem) return null
  if (problem.level !== "partial")
    return {
      scope: "stage",
      level: problem.level,
      icon: problemIcon(problem),
      title: problem.title,
      body: problem.body,
      details: problem.details,
      action: actionFor(problem, retry),
    }
  if (!problem.pages.some((page) => page.pageId === pageId)) return null
  return {
    scope: "page",
    level: "partial",
    icon: FileWarning,
    title: t`Page ${pageNumber} couldn't be processed`,
    body: t`Something on this page couldn't be read, so it may be missing text or images. Every other page is fine. Try again to process it.`,
    details: linesFor(problem.details, pageId),
    action: actionFor(problem, retry),
  }
}
