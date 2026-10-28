import { CirclePlay } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import { ProblemNotice } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemNotice"

export function SectioningRunBanner({ run }: { run: SectioningRun }) {
  const sectioning = useStageActivity("sectioning")
  const extract = useStageActivity("extract")

  if (sectioning.isActive || extract.isActive || !run.isInterrupted) return null

  return (
    <ProblemNotice
      level="resume"
      hex={sectioning.hex}
      icon={CirclePlay}
      title={<Trans>Sectioning stopped before it finished</Trans>}
      body={<Trans>Some pages weren't sectioned. Resume to finish them; every section already made is kept.</Trans>}
      action={{ label: <Trans>Resume</Trans>, icon: CirclePlay, onClick: run.run, disabled: !run.canRun }}
    />
  )
}
