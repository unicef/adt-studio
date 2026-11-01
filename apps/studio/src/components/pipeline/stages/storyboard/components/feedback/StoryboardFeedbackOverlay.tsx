import { useMemo, type RefObject } from "react"
import { buildThreads, filterThreads } from "@/components/publication-feedback/lib/threads"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { useBookPublication } from "@/hooks/use-book-publication"
import type { BookPreviewFrameHandle } from "../BookPreviewFrame"
import { CommentsOnPage } from "./CommentsOnPage"
import { useSectionComments } from "./use-section-comments"

interface StoryboardFeedbackOverlayProps {
  bookLabel: string
  /** The section on screen, in the form comments are keyed by. */
  sectionId: string
  /** Every section of the page, so comments on the others can be pointed to. */
  pageSectionIds: readonly string[]
  frameRef: RefObject<BookPreviewFrameHandle | null>
  containerRef: RefObject<HTMLElement | null>
  /** Off by default: an author styling a page should not have reviewer dots in the way until
   *  they ask for them. */
  enabled: boolean
  /** Selection is lifted so a link from the Sharing dashboard can open one comment. */
  selectedThreadId: string | null
  onSelectThread: (threadId: string | null) => void
  onNavigateSection?: (index: number) => void
}

/**
 * Reviewer comments, on the storyboard's own preview.
 *
 * This is the point of moving feedback out of a stage of its own: the comment and the thing it is
 * about are on the same screen, so acting on it is editing what is already in front of you. It
 * is drawn over the preview rather than in a column beside it, so the page keeps its width.
 *
 * Pins that cannot be placed are listed rather than dropped — see `placePins`. A comment whose
 * element has been edited away is precisely the one an author needs to see.
 */
export function StoryboardFeedbackOverlay({
  bookLabel,
  sectionId,
  pageSectionIds,
  frameRef,
  containerRef,
  enabled,
  selectedThreadId,
  onSelectThread,
  onNavigateSection,
}: StoryboardFeedbackOverlayProps) {
  const comments = useSectionComments({
    bookLabel,
    sectionId,
    pageSectionIds,
    enabled,
    frameRef,
    containerRef,
    selectedThreadId,
    onSelectThread,
  })

  if (!enabled || !comments.published) return null
  return <CommentsOnPage comments={comments} containerRef={containerRef} onNavigateSection={onNavigateSection} />
}

/** The count the storyboard's own chrome shows, so the toggle can say how much is waiting on this
 *  section without the comments being on. */
export function useSectionFeedbackCount(bookLabel: string, sectionId: string): number {
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, published)

  return useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? []).filter((thread) => thread.root.deleted_at === null)
    return filterThreads(all, { resolution: "unresolved", pageSectionId: sectionId }).length
  }, [comments.data, sectionId])
}
