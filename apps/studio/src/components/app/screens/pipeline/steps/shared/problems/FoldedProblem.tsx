import { CircleAlert } from "lucide-react"
import { ProblemNotice } from "./ProblemNotice"
import type { DescribedProblem } from "./useDescribeProblem"
import { useProblemAction } from "./useProblemAction"

export interface ProblemRetry {
  run: () => void
  canRun: boolean
  reason?: string | null
}

export function FoldedProblem({
  label,
  problem,
  retry,
  onOpenPage,
  onShowItems,
  presentation = "inline",
}: {
  label: string
  problem: DescribedProblem | null
  retry?: ProblemRetry
  onOpenPage?: (pageId: string) => void
  onShowItems?: () => void
  presentation?: "inline" | "strip"
}) {
  const actionFor = useProblemAction(label)
  if (!problem || problem.level !== "partial") return null
  return (
    <ProblemNotice
      presentation={presentation}
      level={problem.level}
      icon={CircleAlert}
      title={problem.title}
      body={problem.body}
      details={problem.details}
      pages={problem.pages}
      onOpenPage={onOpenPage}
      onShowItems={onShowItems}
      action={actionFor(problem, retry)}
    />
  )
}
