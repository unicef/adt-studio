import { useBookRun } from "@/hooks/use-book-run"
import { useOptionalStageActivity, type RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { ProblemNotice } from "./problems/ProblemNotice"
import { runErrorOwner } from "./problems/runErrorOwner"
import { useDescribeProblem, type ProblemItems, type ProblemPage, type ProblemStage } from "./problems/useDescribeProblem"
import { problemIcon, useProblemAction } from "./problems/useProblemAction"

export function firstStepError(stage: RunStageActivity | null | undefined): string | null {
  return stage?.steps.find((step) => step.error)?.error ?? null
}

export function useStageError(stage: ProblemStage): string | null {
  const activity = useOptionalStageActivity(stage)
  const { error, stageState } = useBookRun()
  const own = firstStepError(activity)
  if (own) return own
  return runErrorOwner(stageState) === stage ? error : null
}

export function RunErrorNotice({
  label,
  stage,
  hex = "#64748b",
  pages,
  items,
  onOpenPage,
  onShowItems,
  onShowFailed,
  onRetry,
  canRetry = true,
  retryReason,
}: {
  label: string
  stage: ProblemStage
  hex?: string
  pages?: readonly ProblemPage[]
  items?: ProblemItems
  onOpenPage?: (pageId: string) => void
  onShowItems?: () => void
  onShowFailed?: () => void
  onRetry?: () => void
  canRetry?: boolean
  retryReason?: string | null
}) {
  const error = useStageError(stage)
  const describe = useDescribeProblem()
  const actionFor = useProblemAction(label)
  const problem = describe(stage, error, pages, items)
  return (
    <ProblemNotice
      level={problem.level}
      hex={hex}
      icon={problemIcon(problem)}
      title={problem.title}
      body={problem.body}
      details={problem.details}
      pages={problem.pages}
      onOpenPage={onOpenPage}
      onShowItems={onShowFailed ?? (problem.items > 0 ? onShowItems : undefined)}
      action={actionFor(problem, onRetry ? { run: onRetry, canRun: canRetry, reason: retryReason } : undefined)}
    />
  )
}
