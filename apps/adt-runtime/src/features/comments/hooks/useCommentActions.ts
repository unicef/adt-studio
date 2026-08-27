import { useSetAtom } from "jotai"
import { useCallback } from "react"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import type { CommentAnchor } from "@/features/comments/lib/anchor"
import { CommentsApiError } from "@/features/comments/lib/api"
import type { PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentModeAtom,
  commentsSessionAtom,
  commentsStatusAtom,
  openThreadIdAtom,
  pinDragAtom,
  settlingPinIdAtom,
} from "@/features/comments/state/comments.atoms"

export interface CommentActionResult {
  ok: boolean
  /** Set only on failure, already translated, for inline display. */
  message?: string
}

export interface CommentActions {
  edit: (id: string, body: string) => Promise<CommentActionResult>
  remove: (comment: PublishComment) => Promise<CommentActionResult>
  move: (id: string, anchor: CommentAnchor | null) => Promise<CommentActionResult>
}

/**
 * Writes a reviewer can make to a comment that already exists.
 *
 * Every one of them ends in a refetch rather than a local mutation: the worker
 * is the only thing that knows what the reviewer may still see afterwards.
 * Deleting a root, for instance, takes the whole thread away — its replies are
 * hidden with it and no placeholder comes back — so patching local state would
 * leave a pin on screen that no longer exists.
 */
export function useCommentActions(
  context: CommentsRuntimeContext,
  refresh: () => Promise<void>,
): CommentActions {
  const { t } = useCommentsText()
  const setStatus = useSetAtom(commentsStatusAtom)
  const setCommentMode = useSetAtom(commentModeAtom)
  const setSession = useSetAtom(commentsSessionAtom)
  const setOpenThreadId = useSetAtom(openThreadIdAtom)
  const setSettling = useSetAtom(settlingPinIdAtom)
  const setDrag = useSetAtom(pinDragAtom)

  const failure = useCallback(
    async (error: unknown, fallbackKey: Parameters<typeof t>[0]): Promise<CommentActionResult> => {
      if (error instanceof CommentsApiError) {
        if (error.isGone) {
          setStatus("gone")
          setCommentMode(false)
          return { ok: false, message: t("comments-gone-label") }
        }
        if (error.needsIdentity) {
          setSession(null)
          return { ok: false, message: t(fallbackKey) }
        }
        if (error.status === 404) {
          await refresh()
          announceToScreenReader(t("comments-deleted-label"))
          return { ok: false, message: t("comments-deleted-label") }
        }
      }
      return { ok: false, message: t(fallbackKey) }
    },
    [refresh, setCommentMode, setSession, setStatus, t],
  )

  const edit = useCallback(
    async (id: string, body: string): Promise<CommentActionResult> => {
      try {
        await context.api.updateComment(id, { body })
        await refresh()
        announceToScreenReader(t("comments-updated-label"))
        return { ok: true }
      } catch (error) {
        return failure(error, "comments-update-failed-label")
      }
    },
    [context.api, failure, refresh, t],
  )

  const remove = useCallback(
    async (comment: PublishComment): Promise<CommentActionResult> => {
      try {
        await context.api.deleteComment(comment.id)
        if (comment.parent_id === null) setOpenThreadId(null)
        await refresh()
        announceToScreenReader(t("comments-deleted-label"))
        return { ok: true }
      } catch (error) {
        return failure(error, "comments-delete-failed-label")
      }
    },
    [context.api, failure, refresh, setOpenThreadId, t],
  )

  const move = useCallback(
    async (id: string, anchor: CommentAnchor | null): Promise<CommentActionResult> => {
      if (!anchor) {
        setDrag(null)
        announceToScreenReader(t("comments-move-cancelled-label"))
        return { ok: false }
      }
      try {
        await context.api.updateComment(id, { anchor })
        await refresh()
        setDrag(null)
        setSettling(id)
        announceToScreenReader(t("comments-moved-label"))
        return { ok: true }
      } catch (error) {
        setDrag(null)
        return failure(error, "comments-move-failed-label")
      }
    },
    [context.api, failure, refresh, setDrag, setSettling, t],
  )

  return { edit, remove, move }
}
