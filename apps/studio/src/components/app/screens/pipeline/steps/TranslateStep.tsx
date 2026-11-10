import { useLingui } from "@lingui/react/macro"
import { useBookRun } from "@/hooks/use-book-run"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { TranslateResults } from "./translate/TranslateResults"
import { useTranslateData } from "./translate/useTranslateData"
import type { StepProps } from "./shared/types"

export function TranslateStep(props: StepProps) {
  const { label } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const activity = useStageActivity("translate")
  const { stageState } = useBookRun()
  const data = useTranslateData(label, activity.isActive)
  const done = stageState("translate") === "done"
  const entryCount = data.catalog?.entries.length ?? 0
  const hasOutput = entryCount > 0 && (done || data.hasTranslations)

  const loading = useStepLoading(props, { isLoading: data.isLoading, hasOutput: entryCount > 0 })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Translations show up here as each batch finishes.`,
  })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const emptyView = useStepEmptyView(props)

  const phaseView =
    activity.isActive && !data.hasTranslations ? runningView : loading ? loadingView : !hasOutput ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  return <TranslateResults {...props} data={data} done={done} />
}
