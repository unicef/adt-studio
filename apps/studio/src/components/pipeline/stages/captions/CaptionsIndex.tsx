import { useStageStatus } from "@/hooks/use-stage-status"
import { useHasSavedOutputs } from "../../components/OutputReview"
import { CaptionsLandingPage } from "./CaptionsLandingPage"
import { CaptionsView } from "./CaptionsView"

export function CaptionsIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("captions")
  const hasSaved = useHasSavedOutputs(bookLabel, "captions")

  if (status.isCompleted || status.isRunning || hasSaved) {
    return (
      <CaptionsView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <CaptionsLandingPage bookLabel={bookLabel} />
}
