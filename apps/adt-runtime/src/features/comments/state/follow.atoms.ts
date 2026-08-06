import { atom } from "jotai"
import { sessionAtom } from "@/features/comments/state/session-storage"

/**
 * The name of the peer being followed — see `isFollowable` for why a name and not an id.
 *
 * Following ends when the reader says so, and only then. An earlier version also dropped it the
 * moment the reader navigated somewhere the follow had not asked for, on the theory that taking
 * the wheel back should be implicit; in practice it ended the follow constantly and without
 * explanation. The banner and the ring make the state obvious, and the Stop button is always one
 * click away, so an explicit end is the honest one.
 */
export const followedNameAtom = sessionAtom<string | null>("commentsFollowing", null)

export const followingAtom = atom((get) => get(followedNameAtom) !== null)

/** A thread the reader asked for from another page. The sidebar writes it before navigating;
 *  the overlay opens it once that page's comments have loaded, then clears it. */
export const pendingThreadIdAtom = sessionAtom<string | null>("commentsPendingThread", null)
