import { atom } from "jotai"
import { ephemeralAtom } from "@/shared/state/persist"
import { otherPeers, type PeerCursor } from "@/features/comments/lib/presence"
import type { RoomPeer } from "@/features/comments/lib/room-protocol"
import type { RoomStatus } from "@/features/comments/lib/room-socket"

/**
 * Presence is ephemeral by definition — every page turn is a document reload, and who is in the
 * room is a fact about *now*, not a preference to remember. Nothing here is persisted.
 */

export const roomStatusAtom = ephemeralAtom<RoomStatus>("idle")

export const roomPeersAtom = ephemeralAtom<RoomPeer[]>([])

/** Which roster entry is this reader. The room assigns it per socket, so two tabs are two
 *  peers, and neither one draws its own cursor. */
export const selfPeerIdAtom = ephemeralAtom<string | null>(null)

export const peerCursorsAtom = ephemeralAtom<PeerCursor[]>([])

export const otherPeersAtom = atom((get) => otherPeers(get(roomPeersAtom), get(selfPeerIdAtom)))

/** The chip only earns its place on screen once somebody else is in the room. */
export const presenceVisibleAtom = atom(
  (get) => get(roomStatusAtom) === "open" && get(otherPeersAtom).length > 0,
)
