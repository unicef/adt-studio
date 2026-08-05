import { useStageStatus } from "@/hooks/use-stage-status"
import { StoryboardLandingPage } from "./StoryboardLandingPage"
import { StoryboardView } from "./StoryboardView"

export function StoryboardIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("storyboard")

  // A page route is an explicit deep link. Keep the page viewer mounted even
  // while the stage is idle, failed, or awaiting a rerun; otherwise the route
  // unexpectedly falls back to the landing card.
  if (selectedPageId || status.isCompleted || status.isRunning || status.hasError) {
    return (
      <StoryboardView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <StoryboardLandingPage bookLabel={bookLabel} />
}
