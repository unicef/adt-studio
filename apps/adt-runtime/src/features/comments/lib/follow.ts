import type { PageEntry, TocEntry } from "@/features/navigation/state/nav.atoms"
import { ANONYMOUS_PEER_NAME, type RoomPeer } from "@/features/comments/lib/room-protocol"

/**
 * Following another reader, and saying where everyone is.
 *
 * The pure half: no DOM, no storage, no clock. `useFollowPeer` supplies the roster and the
 * current page and acts on what comes back.
 */

/**
 * A peer is followed **by name**, not by id.
 *
 * `RoomPeer.id` is minted per socket, and every page turn in this runtime is a full document
 * reload — so the person you are following gets a new id at the exact moment you most need to
 * keep hold of them. Names are unique per publication (the worker refuses a duplicate), which
 * makes the name the only identity that survives the thing we are trying to follow.
 *
 * The exception is the unnamed reader: everybody who never gave a name is "Someone", so there
 * is no way to tell two of them apart. They can be seen, and not followed.
 */
export function isFollowable(peer: RoomPeer): boolean {
  return peer.name !== ANONYMOUS_PEER_NAME
}

export function findFollowed(peers: readonly RoomPeer[], name: string | null): RoomPeer | null {
  if (name === null) return null
  return peers.find((peer) => peer.name === name) ?? null
}

/** How long a followed peer may be missing from the roster before the follow is dropped. A
 *  page turn *is* a disappearance — leave, then join with a new id — so reacting immediately
 *  would end the follow every single time it was doing its job. */
export const FOLLOW_GRACE_MS = 12_000

export type FollowOutcome =
  | { kind: "idle" }
  /** They are on a page we are not: go there. */
  | { kind: "navigate"; href: string; sectionId: string }
  /** Same page, or a page this snapshot has no entry for. */
  | { kind: "stay" }
  /** Gone long enough that following is over. */
  | { kind: "lost" }

export function followOutcome(input: {
  followed: RoomPeer | null
  /** When the followed peer was last seen in the roster, or `null` if never. */
  missingSinceMs: number | null
  now: number
  currentSectionId: string | null
  pages: readonly PageEntry[]
  name: string | null
}): FollowOutcome {
  if (input.name === null) return { kind: "idle" }

  if (input.followed === null) {
    if (input.missingSinceMs === null) return { kind: "stay" }
    return input.now - input.missingSinceMs >= FOLLOW_GRACE_MS ? { kind: "lost" } : { kind: "stay" }
  }

  const target = input.followed.page_section_id
  if (target === null || target === input.currentSectionId) return { kind: "stay" }

  const page = input.pages.find((entry) => entry.section_id === target)
  if (!page) return { kind: "stay" }

  return { kind: "navigate", href: page.href, sectionId: target }
}

/**
 * Whether the reader has taken the wheel back.
 *
 * Every navigation in this runtime is a `location.href` assignment scattered across page nav,
 * the TOC and the activities, so hooking "the user navigated" at every call site would be a
 * standing invitation to miss one. Instead the follow records where it *sent* the reader; if
 * the document that comes back is a different page, the reader went somewhere themselves and
 * the follow is over. Landing on the page the follow was aiming at anyway is indistinguishable
 * from being taken there, and harmless.
 */
export function followBrokenByReader(input: {
  name: string | null
  sentTo: string | null
  currentSectionId: string | null
}): boolean {
  if (input.name === null) return false
  if (input.sentTo === null) return false
  if (input.currentSectionId === null) return false
  return input.sentTo !== input.currentSectionId
}

/** Where a peer is, in words. Prefers the TOC's own title, falls back to the page number, and
 *  says plainly when it knows neither — a made-up "page 1" would be worse than an admission. */
export function pageLabelFor(
  peer: RoomPeer,
  pages: readonly PageEntry[],
  toc: readonly TocEntry[],
  labels: { unknown: string; page: (n: number) => string },
): string {
  const sectionId = peer.page_section_id
  if (sectionId === null) return labels.unknown

  const heading = toc.find((entry) => entry.section_id === sectionId)
  if (heading && heading.title.trim().length > 0) return heading.title

  const page = pages.find((entry) => entry.section_id === sectionId)
  const index = pages.findIndex((entry) => entry.section_id === sectionId)
  const number = page?.page_number ?? (index === -1 ? null : index + 1)
  return number === null ? labels.unknown : labels.page(number)
}
