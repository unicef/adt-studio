export interface FeedbackDestination {
  to: "/books/$label/$step" | "/books/$label/$step/$pageId"
  params: { label: string; step: string; pageId?: string }
  search?: { sectionId: string; comment: string }
}

/** Carry identity through the URL, resolving its current position when opened.
 * Retired or ambiguous sections remain readable as feedback, without an editor link. */
export function feedbackDestination(
  bookLabel: string,
  pageSectionId: string,
  threadId: string,
  pageId: string | null,
): FeedbackDestination | null {
  if (!pageId || !pageSectionId.trim()) return null
  return {
    to: "/books/$label/$step/$pageId",
    params: { label: bookLabel, step: "storyboard", pageId },
    search: { sectionId: pageSectionId, comment: threadId },
  }
}
