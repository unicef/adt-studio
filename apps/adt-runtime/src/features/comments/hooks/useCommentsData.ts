import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { CommentsApiError } from "@/features/comments/lib/api"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentModeAtom,
  commentsAtom,
  commentsSessionAtom,
  commentsStatusAtom,
} from "@/features/comments/state/comments.atoms"

/**
 * One list request per page load. Resolved threads arrive filtered out by the
 * worker's default, so nothing more is needed to hide them.
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
  const setComments = useSetAtom(commentsAtom)
  const setSession = useSetAtom(commentsSessionAtom)
  const setStatus = useSetAtom(commentsStatusAtom)
  const setCommentMode = useSetAtom(commentModeAtom)

  const refresh = useCallback(async () => {
    if (!context || !sectionId) return
    setStatus("loading")
    try {
      const { comments, session } = await context.api.list(sectionId)
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
  }, [context, sectionId, setComments, setSession, setStatus, setCommentMode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { refresh }
}
