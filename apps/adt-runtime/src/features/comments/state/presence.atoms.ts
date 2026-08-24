import { atom } from "jotai"
import { ephemeralAtom } from "@/shared/state/persist"
import { otherPeers, type PeerCursor, type SeenPeer } from "@/features/comments/lib/presence"
import { sessionAtom } from "@/features/comments/state/session-storage"
import type { RoomPeer } from "@/features/comments/lib/room-protocol"
import type { RoomStatus } from "@/features/comments/lib/room-socket"

/**
 * Presence is a fact about *now*, not a preference to remember, so almost nothing here survives
 * the tab. The one exception is `seenPeersAtom`, and only because a page turn reloads the
 * document: without carrying the last roster across that reload, the reader's own list of who
 * is here empties and refills every time they turn a page.
 */

export const roomStatusAtom = ephemeralAtom<RoomStatus>("idle")

export const roomPeersAtom = ephemeralAtom<RoomPeer[]>([])

/**
 * Who was in the room a moment ago, with the moment recorded.
 *
 * The one thing here that *is* persisted, and only for the length of a tab. A page turn reloads
 * the document, so without this the reader's own chip empties and refills on every turn — the
 * room has not changed, only this reader's socket has. Restoring it lets the list stay on screen
 * while the new socket opens, and the first real presence frame supersedes it.
 */
export const seenPeersAtom = sessionAtom<SeenPeer[]>("commentsSeenPeers", [])

/** Which roster entry is this reader. The id is their identity plus this tab, so two windows
 *  are still two peers, but turning a page keeps the one they had — and neither draws its own
 *  cursor. */
export const selfPeerIdAtom = ephemeralAtom<string | null>(null)

export const peerCursorsAtom = ephemeralAtom<PeerCursor[]>([])

export const otherPeersAtom = atom((get) => otherPeers(get(roomPeersAtom), get(selfPeerIdAtom)))

/**
 * The chip only earns its place on screen once somebody else is in the room.
 *
 * `connecting` and `reconnecting` count as well as `open`, which they did not before: on a page
 * turn the socket is briefly connecting while the restored roster is already on screen, and
 * hiding the chip for that moment is the blink this was meant to remove. A closed or idle room
 * hides it, because then there is genuinely nothing to report.
 */
export const presenceVisibleAtom = atom((get) => {
  const status = get(roomStatusAtom)
  const live = status === "open" || status === "connecting" || status === "reconnecting"
  return live && get(otherPeersAtom).length > 0
})
