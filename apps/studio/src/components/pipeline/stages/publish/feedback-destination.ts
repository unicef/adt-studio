import { parseSectionId } from "@/components/pipeline/stages/storyboard/components/feedback/storyboard-pins"

export interface FeedbackDestination {
  to: "/books/$label/$step" | "/books/$label/$step/$pageId"
  params: { label: string; step: string; pageId?: string }
  search?: { section: number; comment: string }
}

/**
 * Where a comment row goes.
 *
 * A thread carries its `page_section_id` and nothing else, so a row that linked at the stage
 * landed on whatever page the storyboard opens first — the comment you clicked was nowhere on
 * screen, which is the whole of the reviewer's complaint. The id names both the page and the
 * section within it, and the comment names itself, so all three travel in the link.
 *
 * An id that cannot be parsed still opens the stage: the row has to stay clickable even when
 * its page cannot be worked out, and landing somewhere is better than a dead row.
 */
export function feedbackDestination(
  bookLabel: string,
  pageSectionId: string,
  threadId: string,
): FeedbackDestination {
  const parsed = parseSectionId(pageSectionId)
  if (parsed === null) {
    return { to: "/books/$label/$step", params: { label: bookLabel, step: "storyboard" } }
  }
  return {
    to: "/books/$label/$step/$pageId",
    params: { label: bookLabel, step: "storyboard", pageId: parsed.pageId },
    search: { section: parsed.sectionIndex, comment: threadId },
  }
}
