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
import { STEP_PREREQ_REASON } from "@/components/app/screens/pipeline/shared/stepPrereq"
import { useStageRun } from "./useStageRun"
import { useStepPrereq } from "./useStepPrereq"

export interface StageRerunWarning {
  title: ReactNode
  description: ReactNode
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

  const queueStage = stageRun.run
  const run = useCallback(() => {
    if (slug === "easy-read") {
      void runEasyRead()
      return
    }
    queueStage()
  }, [slug, runEasyRead, queueStage])

  const name = getStageLabelI18n(slug)
  const prereqReason = STEP_PREREQ_REASON[slug]

  const disabledReason = !prereq.isMet
    ? prereqReason
      ? i18n._(prereqReason)
      : t`Run ${prereq.upstreamLabel} first.`
    : !stageRun.hasApiKey
      ? t`Add an API key in Book settings to re-run ${name}.`
      : null

  const warning =
    isFixedLayout && FIXED_LAYOUT_SENSITIVE_STAGES.has(slug)
      ? {
          title: <FixedLayoutWarningTitle />,
          description:
            slug === "translate" ? (
              <FixedLayoutExtraLanguagesDescription />
            ) : (
              <FixedLayoutWarningDescription />
            ),
        }
      : null

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
