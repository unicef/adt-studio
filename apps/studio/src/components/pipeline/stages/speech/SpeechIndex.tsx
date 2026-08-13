import { useEffect, useState } from "react"
import { useStageStatus } from "@/hooks/use-stage-status"
import { SpeechLandingPage } from "./SpeechLandingPage"
import { SpeechView } from "./SpeechView"

export function SpeechIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
  embedded = false,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
  embedded?: boolean
}) {
  const status = useStageStatus("speech")
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    if (status.isRunning) setShowSetup(false)
  }, [status.isRunning])

  if ((status.isCompleted || status.isRunning) && !showSetup) {
    return (
      <SpeechView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        embedded={embedded}
        onConfigureSpeech={embedded ? () => setShowSetup(true) : undefined}
      />
    )
  }

  return <SpeechLandingPage bookLabel={bookLabel} embedded={embedded} />
}
