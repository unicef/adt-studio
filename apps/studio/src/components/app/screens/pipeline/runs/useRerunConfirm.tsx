import { useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { RunWarningDialog } from "@/components/pipeline/components/RunWarningDialog"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import type { StageRerun } from "./useStageRerun"

export interface RerunConfirm {
  request: () => void
  canRun: boolean
  disabledReason: string | null
  dialogs: ReactNode
}

export function useRerunConfirm(slug: string, rerun: StageRerun): RerunConfirm {
  const [cascadeOpen, setCascadeOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const name = getStageLabelI18n(slug)
  const confirmColorClass = STAGES.find((stage) => stage.slug === slug)?.color ?? "bg-gray-600"
  const retry = rerun.hasError === true

  const proceed = () => {
    if (rerun.downstreamToReset.length > 0) setCascadeOpen(true)
    else rerun.run()
  }

  const request = () => {
    if (!rerun.canRun) return
    if (rerun.warning) setWarnOpen(true)
    else proceed()
  }

  const dialogs = (
    <>
      <CascadeResetDialog
        open={cascadeOpen}
        onOpenChange={setCascadeOpen}
        affectedStages={rerun.downstreamToReset}
        headerStageSlug={slug}
        title={retry ? <Trans>Try {name} again?</Trans> : <Trans>Re-run {name}?</Trans>}
        description={
          <Trans>
            The completed stages below will be reset and need to run again before
            final outputs are available.
          </Trans>
        }
        confirmLabel={retry ? <Trans>Try again</Trans> : <Trans>Re-run</Trans>}
        confirmColorClass={confirmColorClass}
        onConfirm={() => {
          setCascadeOpen(false)
          rerun.run()
        }}
      />
      {rerun.warning && (
        <RunWarningDialog
          open={warnOpen}
          onOpenChange={setWarnOpen}
          title={rerun.warning.title}
          description={rerun.warning.description}
          confirmLabel={rerun.warning.confirmLabel}
          confirmColorClass={confirmColorClass}
          onConfirm={() => {
            setWarnOpen(false)
            proceed()
          }}
        />
      )}
    </>
  )

  return { request, canRun: rerun.canRun, disabledReason: rerun.disabledReason, dialogs }
}
