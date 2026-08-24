import { atom } from "jotai"
import { deviceOf } from "@/features/comments/lib/room-protocol"
import { findFollowed } from "@/features/comments/lib/follow"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"
import { sessionAtom } from "@/features/comments/state/session-storage"
import { devicePreviewAtom, type DevicePreview } from "@/shared/state/ui.atoms"

/**
 * The peer being followed: their id to match on, and the name they had when you clicked.
 *
 * Both, because they answer different questions. The id is the only thing that reliably points
 * at one person — two pinless readers can share a name — while the name is what the banner and
 * the "they left" message have to say, and those still need to name somebody after they have
 * gone from the roster.
 *
 * Following ends when the reader says so, and only then. An earlier version also dropped it the
 * moment the reader navigated somewhere the follow had not asked for, on the theory that taking
 * the wheel back should be implicit; in practice it ended the follow constantly and without
 * explanation. The banner and the ring make the state obvious, and the Stop button is always one
 * click away, so an explicit end is the honest one.
 */
export interface FollowedPeer {
  id: string
  name: string
}

/** A fresh storage key, so a name left behind by the previous build is not read back as an id
 *  and quietly followed as nobody. */
export const followedPeerAtom = sessionAtom<FollowedPeer | null>("commentsFollowingPeer", null)

export const followingAtom = atom((get) => get(followedPeerAtom) !== null)

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
  const followedPeer = get(followedPeerAtom)
  if (followedPeer === null) return get(devicePreviewAtom) as DevicePreview
  const followed = findFollowed(get(otherPeersAtom), followedPeer.id)
  return followed ? deviceOf(followed) : (get(devicePreviewAtom) as DevicePreview)
})
