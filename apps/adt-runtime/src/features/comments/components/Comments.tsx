import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import {
  commentModeAtom,
  commentsHiddenAtom,
  rememberedNameAtom,
} from "@/features/comments/state/comments.atoms"
import { useCommentMode } from "@/features/comments/hooks/useCommentMode"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsData } from "@/features/comments/hooks/useCommentsData"
import { useFollowPeer } from "@/features/comments/hooks/useFollowPeer"
import { usePresenceRoom } from "@/features/comments/hooks/usePresenceRoom"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { CommentsOverlay } from "@/features/comments/components/CommentsOverlay"
import { FollowingBanner } from "@/features/comments/components/FollowingBanner"
import { PeerCursors } from "@/features/comments/components/PeerCursors"
import { PresenceRoster } from "@/features/comments/components/PresenceRoster"
import { NAME_STORAGE_KEY } from "@/features/comments/components/CommentForm"
import { followingAtom } from "@/features/comments/state/follow.atoms"

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
  const { t } = useCommentsText()
  const mode = useAtomValue(commentModeAtom) as boolean
  const hidden = useAtomValue(commentsHiddenAtom) as boolean
  const following = useAtomValue(followingAtom)
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
      {/* Both statements claim the same spot below the dock, and being carried between pages by
          somebody else is the more surprising of the two, so it wins. */}
      {mode && !following ? (
        <p
          role="status"
          className="pointer-events-none fixed bottom-[calc(var(--dock-height,5rem)+1rem)] left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-1.5 rounded-full bg-popover/95 px-3.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-border backdrop-blur-md duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          {t("comments-mode-hint")}
          <span aria-hidden className="text-popover-foreground/40">
            ·
          </span>
          <span className="font-normal text-popover-foreground/75">
            {t("comments-mode-keyboard-hint-label")}
          </span>
        </p>
      ) : null}
    </>
  )
}
