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

export interface PageLabels {
  unknown: string
  page: (n: number) => string
}

/** Where a page is, in words. Prefers the TOC's own title, falls back to the page number, and
 *  says plainly when it knows neither — a made-up "page 1" would be worse than an admission. */
export function pageLabelForSection(
  sectionId: string | null,
  pages: readonly PageEntry[],
  toc: readonly TocEntry[],
  labels: PageLabels,
): string {
  if (sectionId === null) return labels.unknown

  const heading = toc.find((entry) => entry.section_id === sectionId)
  if (heading && heading.title.trim().length > 0) return heading.title

  const page = pages.find((entry) => entry.section_id === sectionId)
  const index = pages.findIndex((entry) => entry.section_id === sectionId)
  const number = page?.page_number ?? (index === -1 ? null : index + 1)
  return number === null ? labels.unknown : labels.page(number)
}

export function pageLabelFor(
  peer: RoomPeer,
  pages: readonly PageEntry[],
  toc: readonly TocEntry[],
  labels: PageLabels,
): string {
  return pageLabelForSection(peer.page_section_id, pages, toc, labels)
}

/** The page a comment was written on, for the whole-book list. `null` when this snapshot has no
 *  entry for it — a comment from a version whose pages have since been renumbered. */
export function hrefForSection(
  sectionId: string,
  pages: readonly PageEntry[],
): string | null {
  return pages.find((entry) => entry.section_id === sectionId)?.href ?? null
}
