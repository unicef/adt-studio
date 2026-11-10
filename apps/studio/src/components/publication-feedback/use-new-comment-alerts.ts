import { useEffect } from "react"
import { useLingui } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import { useBookPublication } from "@/hooks/use-book-publication"
import { useAuthorIdentity, usePublicationComments } from "@/hooks/use-publication-feedback"
import { excerpt, newReaderComments } from "./new-comment-alerts"

const seenByBook = new Map<string, Set<string>>()

/**
 * Tells the author when readers leave new comments while Studio is open. The comments query
 * polls on its own; this watches it and raises one toast per batch, with a way straight to the
 * feedback. The first load only records what is already there, so opening a book never alerts.
 */
export function useNewCommentAlerts(bookLabel: string): void {
  const { t } = useLingui()
  const navigate = useNavigate()
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const { data: status } = useBookPublication(bookLabel)
  const enabled = (status?.record ?? null) !== null && (status?.connected ?? false)
  const { data } = usePublicationComments(bookLabel, enabled)
  const comments = data?.comments

  useEffect(() => {
    if (!comments) return
    const seen = seenByBook.get(bookLabel)
    if (!seen) {
      seenByBook.set(bookLabel, new Set(comments.map((comment) => comment.id)))
      return
    }
    const fresh = newReaderComments(comments, seen, identity.displayName)
    for (const comment of comments) seen.add(comment.id)
    if (fresh.length === 0) return
    const first = fresh[0]
    const open = () =>
      void navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "publish" } })
    toast(fresh.length === 1 ? t`New comment from ${first.author_name}` : t`${fresh.length} new comments`, {
      description: fresh.length === 1 ? excerpt(first.body) : [...new Set(fresh.map((c) => c.author_name))].join(", "),
      action: { label: t`Open`, onClick: open },
    })
  }, [comments, bookLabel, identity.displayName, navigate, t])
}
