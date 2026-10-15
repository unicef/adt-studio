import { useCallback, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import {
  FixedLayoutExtraLanguagesDescription,
  FixedLayoutWarningDescription,
  FixedLayoutWarningTitle,
} from "@/components/pipeline/components/FixedLayoutWarning"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useRunEasyRead } from "@/components/pipeline/stages/easy-read/use-run-easy-read"
import { useBookRun } from "@/hooks/use-book-run"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { useIsFixedLayout } from "@/hooks/use-fixed-layout"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { stepPrereqReason } from "@/components/app/screens/pipeline/shared/stepPrereq"
import { useStageRun } from "./useStageRun"
import { useStepPrereq } from "./useStepPrereq"
import { useContentFlow, useFlowCopy } from "@/components/app/screens/pipeline/shared/contentFlow"
import { Trans } from "@lingui/react/macro"

export interface StageRerunWarning {
  title: ReactNode
  description: ReactNode
  confirmLabel?: ReactNode
}

export interface StageRerun {
  hasRun: boolean
  isRunning: boolean
  isCancelling: boolean
  canRun: boolean
  disabledReason: string | null
  downstreamToReset: StageName[]
  warning: StageRerunWarning | null
  run: () => void
  cancel: () => void
}

const FIXED_LAYOUT_SENSITIVE_STAGES = new Set<DockSlug>(["easy-read", "translate"])

export function useStageRerun(label: string, slug: DockSlug): StageRerun {
  const { t, i18n } = useLingui()
  const stageRun = useStageRun(label, slug)
  const prereq = useStepPrereq(label, slug)
  const downstreamToReset = useDownstreamWithOutput(slug)
  const isFixedLayout = useIsFixedLayout(label)
  const { isCancelling, cancelRun, stageState } = useBookRun()
  const { runEasyRead } = useRunEasyRead(label)
  const flow = useContentFlow(label)
  const flowCopy = useFlowCopy()

  const queueStage = stageRun.run
  const run = useCallback(() => {
    if (slug === "easy-read") {
      void runEasyRead()
      return
    }
    queueStage()
  }, [slug, runEasyRead, queueStage])

  const name = getStageLabelI18n(slug)
  const prereqReason = stepPrereqReason(slug)

  const disabledReason = !prereq.isMet
    ? prereqReason
      ? i18n._(prereqReason)
      : t`Run ${prereq.upstreamLabel} first.`
    : !stageRun.hasApiKey
      ? t`Add an API key in Book settings to re-run ${name}.`
      : null

  const contentWarning: StageRerunWarning | null =
    (slug === "translate" || slug === "speech") && flow.unfinished.length > 0
      ? {
          title: flowCopy.warningTitle,
          description: flowCopy.warningBody(flow.unfinished),
          confirmLabel: slug === "translate" ? <Trans>Translate anyway</Trans> : <Trans>Generate anyway</Trans>,
        }
      : null

  const warning = contentWarning ??
    (isFixedLayout && FIXED_LAYOUT_SENSITIVE_STAGES.has(slug)
      ? {
          title: <FixedLayoutWarningTitle />,
          description:
            slug === "translate" ? (
              <FixedLayoutExtraLanguagesDescription />
            ) : (
              <FixedLayoutWarningDescription />
            ),
        }
      : null)

  return {
    hasRun: stageRun.isRunnable && stageState(slug) !== "idle",
    isRunning: stageRun.isRunning,
    isCancelling,
    canRun: prereq.isMet && stageRun.canRun,
    disabledReason,
    downstreamToReset,
    warning,
    run,
    cancel: cancelRun,
  }
}
