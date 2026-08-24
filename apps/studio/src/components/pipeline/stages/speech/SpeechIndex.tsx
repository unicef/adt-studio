import { useStageStatus } from "@/hooks/use-stage-status"
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

  if (status.isCompleted || status.isRunning) {
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
