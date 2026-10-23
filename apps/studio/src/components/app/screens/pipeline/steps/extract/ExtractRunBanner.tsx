import { CirclePlay } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { ExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"
import { ProblemNotice } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemNotice"
import { useDescribeProblem, type ProblemPage } from "@/components/app/screens/pipeline/steps/shared/problems/useDescribeProblem"
import { problemIcon, useProblemAction } from "@/components/app/screens/pipeline/steps/shared/problems/useProblemAction"

export function ExtractRunBanner({
  label,
  run,
  pages,
  onOpenPage,
  retry,
}: {
  label: string
  run: ExtractRun
  retry?: { run: () => void; canRun: boolean; reason?: string | null }
  pages?: readonly ProblemPage[]
  onOpenPage?: (pageId: string) => void
}) {
  const extract = useStageActivity("extract")
  const activity = useRunActivity()
  const describe = useDescribeProblem()
  const actionFor = useProblemAction(label)

  if (extract.isActive) return null

  if (run.hasError) {
    const problem = describe("extract", activity.error, pages)
    return (
      <ProblemNotice
        level={problem.level}
        hex={extract.hex}
        icon={problemIcon(problem)}
        title={problem.title}
        body={problem.body}
        details={problem.details}
        pages={problem.pages}
        onOpenPage={onOpenPage}
        action={actionFor(problem, retry ?? run)}
      />
    )
  }

  if (run.isInterrupted) {
    return (
      <ProblemNotice
        level="resume"
        hex={extract.hex}
        icon={CirclePlay}
        title={<Trans>Extraction stopped before it finished</Trans>}
        body={<Trans>Some steps didn't run. Resume to finish them; everything already done is kept.</Trans>}
        action={{ label: <Trans>Resume</Trans>, icon: CirclePlay, onClick: run.run, disabled: !run.canRun }}
      />
    )
  }

  return null
}
