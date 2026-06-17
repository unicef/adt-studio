import { useStageStatus } from "@/hooks/use-stage-status"
import { EasyReadLandingPage } from "./EasyReadLandingPage"
import { EasyReadView } from "./EasyReadView"

export function EasyReadIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("easy-read")

  if (status.isCompleted || status.isRunning) {
    return (
      <EasyReadView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <EasyReadLandingPage bookLabel={bookLabel} />
}
