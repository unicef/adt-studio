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

/** Locally remembered display name — a convenience for the name field only.
 *  Identity itself lives in the worker's HttpOnly cookie. */
export const rememberedNameAtom = ephemeralAtom<string>("")

export const pageCommentCountAtom = atom((get) => rootComments(get(commentsAtom)).length)

export const commentsWritableAtom = atom((get) => get(commentsStatusAtom) !== "gone")
