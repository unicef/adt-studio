import { useLingui } from "@lingui/react/macro"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { NextStepConfirm } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useStageError } from "../RunErrorNotice"
import { useDescribeProblem, type DescribedProblem, type ProblemItems, type ProblemPage, type ProblemStage } from "./useDescribeProblem"

export interface StageProblem {
  failed: boolean
  problem: DescribedProblem | null
  partial: boolean
  partialConfirm: NextStepConfirm | null
}

export interface StageProblemOptions {
  stage: ProblemStage
  pages: readonly ProblemPage[]
  items?: ProblemItems
  retry: () => void
  onOpenPage: (pageId: string) => void
  partialBody?: (firstFailed: ProblemPage | undefined) => string
}

export function useStageProblem({ stage, pages, items, retry, onOpenPage, partialBody }: StageProblemOptions): StageProblem {
  const { t } = useLingui()
  const activity = useOptionalStageActivity(stage)
  const hasError = useStageStatus(stage).hasError
  const error = useStageError(stage)
  const describe = useDescribeProblem()

  const failed = hasError && !(activity?.isActive ?? false)
  const problem = failed ? describe(stage, error, pages, items) : null
  const partial = problem?.level === "partial"
  const firstFailed = problem?.pages[0]

  const partialConfirm: NextStepConfirm | null =
    partial && problem
      ? {
          title: problem.title,
          body:
            partialBody?.(firstFailed) ??
            (firstFailed
              ? t`You can keep going. Page ${firstFailed.pageNumber} may be incomplete until you fix it.`
              : t`You can keep going. Some parts may be incomplete until you fix them.`),
          reviewLabel: firstFailed ? t`Open page ${firstFailed.pageNumber}` : t`Try again`,
          onReview: () => (firstFailed ? onOpenPage(firstFailed.pageId) : retry()),
        }
      : null

  return { failed, problem, partial, partialConfirm }
}
