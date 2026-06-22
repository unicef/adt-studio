import { useStageStatus } from "@/hooks/use-stage-status"
import { usePages } from "@/hooks/use-pages"
import { ExtractLandingPage } from "./ExtractLandingPage"
import { ExtractView } from "./ExtractView"

export function ExtractIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("extract")
  const { data: pages } = usePages(bookLabel)
  const hasPages = (pages ?? []).length > 0

  // Show the extracted pages whenever extraction has produced them — not only
  // when the whole stage is "complete". A derived step like book-summary being
  // re-queued (e.g. after a language change) must not hide the pages or send
  // the user back to the pre-run landing page.
  if (status.isCompleted || status.isRunning || hasPages) {
    return (
      <ExtractView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <ExtractLandingPage bookLabel={bookLabel} />
}
