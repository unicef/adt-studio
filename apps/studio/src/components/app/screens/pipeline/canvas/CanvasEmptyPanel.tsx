import { Trans, useLingui } from "@lingui/react/macro"
import { StageRunningPanel } from "@/components/app/screens/pipeline/runs/StageRunningPanel"
import type { RunActivity, RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import type { StoryboardRun } from "@/components/app/screens/pipeline/runs/useStoryboardRun"
import { StoryboardEmptyState, type StoryboardPhase } from "./StoryboardEmptyState"

export interface CanvasEmptyPanelProps {
  run: RunActivity
  foundationRunning: RunStageActivity | null
  phase: StoryboardPhase
  pageCount: number
  sectionCount: number
  emptyRun: SectioningRun | StoryboardRun
  onOpenSettings: () => void
}

export function CanvasEmptyPanel({
  run,
  foundationRunning,
  phase,
  pageCount,
  sectionCount,
  emptyRun,
  onOpenSettings,
}: CanvasEmptyPanelProps) {
  const { t } = useLingui()

  return (
    <div className="flex flex-1 items-center pb-24">
      {foundationRunning ? (
        <StageRunningPanel
          stage={foundationRunning}
          isCancelling={run.isCancelling}
          onCancel={run.cancelRun}
          outcome={
            foundationRunning.slug === "extract"
              ? t`Pages and images show up in the left rail as each page is extracted.`
              : foundationRunning.slug === "sectioning"
                ? t`Sections show up in the left rail as each page is structured.`
                : t`Rendered pages replace this panel as each page is built.`
          }
        />
      ) : (
        <StoryboardEmptyState
          phase={phase}
          pageCount={pageCount}
          sectionCount={sectionCount}
          onGenerate={emptyRun.run}
          onCreateManually={() => {}}
          onOpenSettings={onOpenSettings}
          canGenerate={emptyRun.canRun}
          disabledReason={
            emptyRun.hasApiKey ? undefined : phase === "render" ? (
              <Trans>Add an API key in Book settings to run the storyboard.</Trans>
            ) : (
              <Trans>Add an API key in Book settings to run sectioning.</Trans>
            )
          }
        />
      )}
    </div>
  )
}
