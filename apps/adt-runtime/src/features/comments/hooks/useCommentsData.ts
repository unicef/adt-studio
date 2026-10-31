import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { CommentsApiError } from "@/features/comments/lib/api"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  bookCommentsAtom,
  commentModeAtom,
  commentScopeAtom,
  commentsAtom,
  commentsSessionAtom,
  commentsStatusAtom,
  showResolvedAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * One list request per page load, plus one whenever the reviewer flips "show
 * resolved" — resolved threads are filtered out by the worker's default, so the
 * toggle is a refetch rather than a client-side filter, and the muted pins can
 * never be a stale copy of what the author has since re-opened.
 *
 * A `410` means the link was revoked or expired while the page was open: the
 * snapshot bytes are already in the browser, so the reader keeps working and
 * only commenting goes away — quietly, without an error dialog for something
 * the reviewer cannot fix.
 */
export function useCommentsData(context: CommentsRuntimeContext | null): {
  refresh: () => Promise<void>
} {
  const sectionId = useAtomValue(currentSectionIdAtom)
  const showResolved = useAtomValue(showResolvedAtom) as boolean
  const setComments = useSetAtom(commentsAtom)
  const setSession = useSetAtom(commentsSessionAtom)
  const setStatus = useSetAtom(commentsStatusAtom)
  const setCommentMode = useSetAtom(commentModeAtom)
  const scope = useAtomValue(commentScopeAtom) as string
  const setBookComments = useSetAtom(bookCommentsAtom)

  const refresh = useCallback(async () => {
    if (!context || !sectionId) return
    setStatus("loading")
    try {
      const { comments, session } = await context.api.list(sectionId, {
        includeResolved: showResolved,
      })
      setComments(comments)
      setSession(session)
      setStatus("ready")
    } catch (error) {
      if (error instanceof CommentsApiError && error.isGone) {
        setStatus("gone")
        setCommentMode(false)
        return
      }
      setStatus("ready")
    }
  }, [context, sectionId, setComments, setSession, setStatus, setCommentMode, showResolved])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** The whole book is a second, larger request, so it is made only for the tab that shows it —
   *  and re-made when "show resolved" changes, for the same reason the per-page list is. */
  useEffect(() => {
    if (!context || scope !== "book") return
    let cancelled = false
    void (async () => {
      try {
        const { comments } = await context.api.listAll({ includeResolved: showResolved })
        if (!cancelled) setBookComments(comments)
      } catch {
        /* The per-page list is the one the page needs; a failed book-wide read leaves that tab
           empty rather than taking the page down with it. */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [context, scope, showResolved, setBookComments])

  return { refresh }
}
