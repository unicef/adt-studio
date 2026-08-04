import { atom } from "jotai"
import { ephemeralAtom, persistedBoolAtom } from "@/shared/state/persist"
import type { CommentAnchor } from "@/features/comments/lib/anchor"
import type { CommenterSession, PublishComment } from "@/features/comments/lib/contract"
import { rootComments } from "@/features/comments/lib/contract"

/** Comment mode survives a page turn (each page is a document reload), so a
 *  reviewer working through a book stays in the mode they chose. */
export const commentModeAtom = persistedBoolAtom("commentMode", false)

export const commentsAtom = ephemeralAtom<PublishComment[]>([])

export const commentsSessionAtom = ephemeralAtom<CommenterSession | null>(null)

export type CommentsStatus = "idle" | "loading" | "ready" | "gone"

export const commentsStatusAtom = ephemeralAtom<CommentsStatus>("idle")

/** A pin the reviewer has dropped but not yet posted. `anchor` is null when the
 *  click could not be anchored — the comment still belongs to the page. */
export interface CommentDraft {
  anchor: CommentAnchor | null
  x: number
  y: number
}

export const commentDraftAtom = ephemeralAtom<CommentDraft | null>(null)

export const openThreadIdAtom = ephemeralAtom<string | null>(null)

/** Both view preferences survive a page turn for the same reason comment mode
 *  does: a reviewer sweeping a book chose them once, not once per page. */
export const showResolvedAtom = persistedBoolAtom("commentsShowResolved", false)

export const sidebarOpenAtom = persistedBoolAtom("commentsSidebar", false)

/** A pin being dragged to a new anchor. `point` follows the pointer, `valid` is
 *  false while the pointer is outside `#content`, where a drop cannot anchor. */
export interface PinDrag {
  id: string
  point: { x: number; y: number }
  valid: boolean
}

export const pinDragAtom = ephemeralAtom<PinDrag | null>(null)

/** Ids of pins mid-settle after a drag or a jump from the sidebar. Purely
 *  presentational, and short-lived. */
export const settlingPinIdAtom = ephemeralAtom<string | null>(null)

export const flashedPinIdAtom = ephemeralAtom<string | null>(null)

/** The last polite announcement for the feature's live region. A counter rides
 *  along so two identical messages still re-announce. */
export interface CommentsAnnouncement {
  message: string
  nonce: number
}

export const announcementAtom = ephemeralAtom<CommentsAnnouncement | null>(null)

/** Locally remembered display name — a convenience for the name field only.
 *  Identity itself lives in the worker's HttpOnly cookie. */
export const rememberedNameAtom = ephemeralAtom<string>("")

/** The dock badge counts what still needs the author: resolved threads are
 *  finished business, so they never inflate it even while they are on screen. */
export const pageCommentCountAtom = atom(
  (get) => rootComments(get(commentsAtom)).filter((comment) => !comment.resolved_at).length,
)

export const pageResolvedCountAtom = atom(
  (get) => rootComments(get(commentsAtom)).filter((comment) => comment.resolved_at).length,
)

export const commentsWritableAtom = atom((get) => get(commentsStatusAtom) !== "gone")
