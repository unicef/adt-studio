import { LanguageView } from "../languages/LanguageView"

/**
 * Speech-stage view. Today delegates to the shared `LanguageView`
 * implementation with `stageSlug="speech"` so the deep `isSpeechStage`
 * branches inside `LanguageView` render the audio-focused UI.
 *
 * The longer-term goal is to migrate speech-only paths into this file and
 * leave `LanguageView` for text translation only; this wrapper is the
 * file boundary we'll trim against.
 */
export function SpeechView({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  stageSlug?: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  return (
    <LanguageView
      bookLabel={bookLabel}
      stageSlug="speech"
      selectedPageId={selectedPageId}
      onSelectPage={onSelectPage}
    />
  )
}
