import type { RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import type { StoryboardRun } from "@/components/app/screens/pipeline/runs/useStoryboardRun"
import type { StoryboardPhase } from "@/components/app/screens/pipeline/canvas/StoryboardEmptyState"

export interface StoryboardPhaseOptions {
  hasSections: boolean
  extractActivity: RunStageActivity
  sectioningActivity: RunStageActivity
  storyboardActivity: RunStageActivity
  sectioningRun: SectioningRun
  storyboardRun: StoryboardRun
}

export interface StoryboardPhaseState {
  phase: StoryboardPhase
  emptyRun: SectioningRun | StoryboardRun
  foundationRunning: RunStageActivity | null
}

export function useStoryboardPhase({
  hasSections,
  extractActivity,
  sectioningActivity,
  storyboardActivity,
  sectioningRun,
  storyboardRun,
}: StoryboardPhaseOptions): StoryboardPhaseState {
  const phase: StoryboardPhase = hasSections ? "render" : "sections"
  const running = [extractActivity, sectioningActivity, storyboardActivity].find(
    (activity) => activity.isActive,
  )

  return {
    phase,
    emptyRun: phase === "render" ? storyboardRun : sectioningRun,
    foundationRunning: running ?? null,
  }
}
