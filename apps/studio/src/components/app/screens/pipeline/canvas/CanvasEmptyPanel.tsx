import { Trans, useLingui } from "@lingui/react/macro"
import { StageRunningPanel } from "@/components/app/screens/pipeline/runs/StageRunningPanel"
import { LiveRunPanel, RunStripOnly } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { useVariant } from "@/components/app/lab/variants"
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
  label?: string
  pages?: ReadonlyArray<{ pageId: string; pageNumber: number }>
}

export function CanvasEmptyPanel({
  run,
  foundationRunning,
  phase,
  pageCount,
  sectionCount,
  emptyRun,
  onOpenSettings,
  label,
  pages,
}: CanvasEmptyPanelProps) {
  const { t } = useLingui()
  const runningVariant = useVariant("running")
  const live = runningVariant === "live"

  if (foundationRunning && runningVariant === "strip") {
    return (
      <div className="flex w-full flex-1 px-6">
        <RunStripOnly stage={foundationRunning} />
      </div>
    )
  }

  if (foundationRunning && live) {
    return (
      <div className="flex w-full flex-1 overflow-y-auto px-6">
        <LiveRunPanel
          stage={foundationRunning}
          total={pageCount || 12}
          label={label}
          pages={foundationRunning.slug === "extract" ? undefined : pages}
          outcome={
            foundationRunning.slug === "extract"
              ? t`Each page lands here as it is extracted.`
              : foundationRunning.slug === "sectioning"
                ? t`Each page is structured into sections in turn.`
                : t`Rendered pages replace these placeholders as each page is built.`
          }
        />
      </div>
    )
  }

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
            ("hasProvider" in emptyRun ? emptyRun.hasProvider : emptyRun.hasApiKey) ? undefined : phase === "render" ? (
              <Trans>Add an API key in Book settings to run the storyboard.</Trans>
            ) : (
              <Trans>Set up AI access in Book settings to run sectioning.</Trans>
            )
          }
        />
      )}
    </div>
  )
}
