import { Trans } from "@lingui/react/macro"
import { usePages } from "@/hooks/use-pages"
import { useStageStatus } from "@/hooks/use-stage-status"
import { LoadingState } from "../../components/LoadingState"
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
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)

  // The stage is marked stale by edits that don't destroy anything — the
  // renderings it produced are still on disk and still editable. Gating the view
  // on stage status alone locked the user out of the editor, and so out of the
  // per-section re-render that resolves the staleness, until they re-ran the
  // whole book. Show the editor whenever there is a rendering to edit.
  const hasRendering = (pages ?? []).some((p) => p.hasRendering)

  if (status.isCompleted || status.isRunning || hasRendering) {
    return (
      <StoryboardView
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
      />
    )
  }

  // Deciding on an empty page list would flash the landing page at someone whose
  // renderings are merely still loading.
  if (pagesLoading) {
    return <LoadingState stageSlug="storyboard" label={<Trans>Loading pages...</Trans>} />
  }

  return <StoryboardLandingPage bookLabel={bookLabel} />
}
