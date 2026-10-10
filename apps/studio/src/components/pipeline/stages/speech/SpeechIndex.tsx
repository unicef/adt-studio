import { useStageStatus } from "@/hooks/use-stage-status"
import { useHasSavedOutputs } from "../../components/OutputReview"
import { SpeechLandingPage } from "./SpeechLandingPage"
import { SpeechView } from "./SpeechView"

export function SpeechIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("speech")
  const hasSaved = useHasSavedOutputs(bookLabel, "speech")

  if (status.isCompleted || status.isRunning || status.hasError || hasSaved) {
    return (
      <SpeechView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <SpeechLandingPage bookLabel={bookLabel} />
}
