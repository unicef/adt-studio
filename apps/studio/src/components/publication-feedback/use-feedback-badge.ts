import { useBookPublication } from "@/hooks/use-book-publication"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { unresolvedThreadCount } from "./lib/threads"

export interface FeedbackBadge {
  /** The book has a publication record — otherwise there is nothing to have feedback on. */
  published: boolean
  unresolvedCount: number
  /** The comment list has answered at least once; until then "0 open" is not a claim. */
  loaded: boolean
  /** The count cannot be known right now — no account connected, or the service did not
   *  answer. Distinct from `!loaded`, which means "still arriving": a caller that treats the
   *  two alike draws a spinner that never stops. */
  unavailable: boolean
}

/**
 * What the stage rail needs to draw the Feedback badge. A book that was never published skips
 * the comment fetch entirely — the query is disabled rather than answered with an empty list,
 * so opening any other stage of an unpublished book costs no worker round trip.
 */
export function useFeedbackBadge(bookLabel: string): FeedbackBadge {
  const { data: status } = useBookPublication(bookLabel)
  const published = (status?.record ?? null) !== null
  const enabled = published && (status?.connected ?? false)
  const { data, isError } = usePublicationComments(bookLabel, enabled)

  return {
    published,
    unresolvedCount: data ? unresolvedThreadCount(data.comments) : 0,
    loaded: data !== undefined,
    unavailable: published && data === undefined && (isError || !enabled),
  }
}
