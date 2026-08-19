import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { StoryboardPhase } from "@/components/redesign/screens/pipeline/canvas/StoryboardEmptyState"
import type { RunStageActivity } from "@/components/redesign/screens/pipeline/runs/useRunActivity"
import type { PipelineState } from "@/components/redesign/screens/pipeline/shared/usePipelineState"
import { StatusPill } from "./StatusPill"

export interface PipelineStatusProps {
  state: PipelineState
  runningStage: RunStageActivity | undefined
  empty: boolean
  phase: StoryboardPhase
  /** Pages whose render is behind the sections it was built from. */
  outdatedCount: number
}

export function PipelineStatus({
  state,
  runningStage,
  empty,
  phase,
  outdatedCount,
}: PipelineStatusProps) {
  const { t } = useLingui()

  if (runningStage) {
    return (
      <StatusPill tone="running">
        <span className="truncate">
          {runningStage.state === "queued" ? runningStage.label : runningStage.runningLabel}
        </span>
        {runningStage.current?.progress && (
          <span className="font-mono text-[11px] font-medium tabular-nums">
            {runningStage.current.progress}
          </span>
        )}
      </StatusPill>
    )
  }

  if (empty) {
    return (
      <StatusPill tone="ok">
        {phase === "render"
          ? t`Sectioning complete · ${state.sectionCount} sections`
          : t`Extraction complete · ${state.pages.length} pages`}
      </StatusPill>
    )
  }

  if (outdatedCount > 0) {
    return (
      <StatusPill tone="warn">
        {t`${plural(outdatedCount, {
          one: "# page out of date",
          other: "# pages out of date",
        })}`}
      </StatusPill>
    )
  }

  if (state.missingCaptions > 0) {
    return <StatusPill tone="warn">{t`Review queue · ${state.missingCaptions}`}</StatusPill>
  }

  return (
    <StatusPill tone="ok">
      <Trans>Nothing pending review</Trans>
    </StatusPill>
  )
}
