import { atom } from "jotai"
import { deviceOf } from "@/features/comments/lib/room-protocol"
import { findFollowed } from "@/features/comments/lib/follow"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"
import { sessionAtom } from "@/features/comments/state/session-storage"
import { devicePreviewAtom, type DevicePreview } from "@/shared/state/ui.atoms"

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

/**
 * The width this reader is actually shown at.
 *
 * While following, it is the followed reader's — otherwise you would be watching somebody work
 * through a phone layout while looking at a desktop one, which is worse than not following at
 * all. The reader's own choice is left untouched underneath and comes back the moment they stop.
 */
export const effectiveDeviceAtom = atom<DevicePreview>((get) => {
  const name = get(followedNameAtom)
  if (name === null) return get(devicePreviewAtom) as DevicePreview
  const followed = findFollowed(get(otherPeersAtom), name)
  return followed ? deviceOf(followed) : (get(devicePreviewAtom) as DevicePreview)
})
