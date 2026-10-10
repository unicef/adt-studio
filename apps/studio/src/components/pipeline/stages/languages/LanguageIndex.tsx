import { useStageStatus } from "@/hooks/use-stage-status"
import { useHasSavedOutputs } from "../../components/OutputReview"
import { LanguageLandingPage } from "./LanguageLandingPage"
import { LanguageView } from "./LanguageView"

export function LanguageIndex({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const status = useStageStatus("translate")
  const hasSaved = useHasSavedOutputs(bookLabel, "translate")

  if (status.isCompleted || status.isRunning || hasSaved) {
    return (
      <LanguageView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  return <LanguageLandingPage bookLabel={bookLabel} />
}
