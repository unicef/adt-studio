import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import {
  commentModeAtom,
  commentsHiddenAtom,
  commentsWritableAtom,
  rememberedNameAtom,
} from "@/features/comments/state/comments.atoms"
import { useCommentMode } from "@/features/comments/hooks/useCommentMode"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsData } from "@/features/comments/hooks/useCommentsData"
import { useFollowPeer } from "@/features/comments/hooks/useFollowPeer"
import { usePresenceRoom } from "@/features/comments/hooks/usePresenceRoom"
import { CommentModePill } from "@/features/comments/components/CommentModePill"
import { CommentsOverlay } from "@/features/comments/components/CommentsOverlay"
import { FollowingBanner } from "@/features/comments/components/FollowingBanner"
import { PeerCursors } from "@/features/comments/components/PeerCursors"
import { PresenceRoster } from "@/features/comments/components/PresenceRoster"
import { NAME_STORAGE_KEY } from "@/features/comments/components/CommentForm"

/**
 * Feature root, mounted from `ChromeRoot`. Everything below it is dead code at
 * runtime unless the book was published *and* is being read through a share
 * link: no fetch, no listeners, no DOM.
 *
 * "Just the book" (`commentsHidden`) takes the overlay, the cursors and the roster off screen
 * together — but deliberately leaves the room connected. Staying in the room is what keeps this
 * reader visible to everyone else and followable; hiding is about what *this* reader wants to
 * look at, and must not quietly turn them into a ghost.
 */
export function Comments() {
  const context = useCommentsContext()
  const mode = useAtomValue(commentModeAtom) as boolean
  const writable = useAtomValue(commentsWritableAtom)
  const hidden = useAtomValue(commentsHiddenAtom) as boolean
  const setRememberedName = useSetAtom(rememberedNameAtom)

  useCommentMode(context !== null && !hidden)
  const { refresh } = useCommentsData(context)
  usePresenceRoom(context)
  useFollowPeer(context !== null && !hidden)

  useEffect(() => {
    if (!context) return
    try {
      const stored = window.localStorage.getItem(NAME_STORAGE_KEY)
      if (stored) setRememberedName(stored)
    } catch {
      /* private-mode storage refusal must not block commenting */
    }
  }, [context, setRememberedName])

  if (!context) return null
  if (hidden) return null

  return (
    <>
      <CommentsOverlay context={context} refresh={refresh} />
      <PeerCursors />
      <PresenceRoster />
      <FollowingBanner />
      {mode && writable ? <CommentModePill /> : null}
    </>
  )
}
