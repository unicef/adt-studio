import { useRunActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { ProblemNotice } from "./problems/ProblemNotice"
import { useDescribeProblem, type ProblemPage } from "./problems/useDescribeProblem"
import { problemIcon, useProblemAction } from "./problems/useProblemAction"

export function RunErrorNotice({
  label,
  stage,
  hex = "#64748b",
  pages,
  onOpenPage,
  onRetry,
  canRetry = true,
}: {
  label: string
  stage: "extract" | "sectioning"
  hex?: string
  pages?: readonly ProblemPage[]
  onOpenPage?: (pageId: string) => void
  onRetry?: () => void
  canRetry?: boolean
}) {
  const activity = useRunActivity()
  const describe = useDescribeProblem()
  const actionFor = useProblemAction(label)
  const problem = describe(stage, activity.error, pages)
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
      action={actionFor(problem, onRetry ? { run: onRetry, canRun: canRetry } : undefined)}
    />
  )
}
