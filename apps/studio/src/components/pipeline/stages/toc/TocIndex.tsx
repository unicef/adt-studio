import { useStageStatus } from "@/hooks/use-stage-status"
import { useToc } from "@/hooks/use-toc"
import { TocLandingPage } from "./TocLandingPage"
import { TocView } from "./TocView"

export function TocIndex({
  bookLabel,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("toc")
  const { data } = useToc(bookLabel)

  if (status.isCompleted || status.isRunning || data != null) {
    return <TocView bookLabel={bookLabel} />
  }

  return <TocLandingPage bookLabel={bookLabel} />
}
