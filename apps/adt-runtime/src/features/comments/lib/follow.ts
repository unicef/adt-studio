import type { PageEntry, TocEntry } from "@/features/navigation/state/nav.atoms"
import { ANONYMOUS_PEER_NAME, type RoomPeer } from "@/features/comments/lib/room-protocol"

/**
 * Following another reader, and saying where everyone is.
 *
 * The pure half: no DOM, no storage, no clock. `useFollowPeer` supplies the roster and the
 * current page and acts on what comes back.
 */

/**
 * Whether a peer can be followed at all.
 *
 * Following used to key on the *name*, because a peer id was minted per socket and every page
 * turn is a document reload — the followed reader changed id at the exact moment you most needed
 * to keep hold of them. The reasoning came with a claim that names are unique per publication,
 * and that stopped being true in M3.5: a name only collides when both sessions carry a PIN, so
 * two pinless readers can both be "Ana", and following one of them could attach to the other.
 * Ids now survive a page turn, so the follow keys on the id and that ambiguity is gone.
 *
 * The unnamed reader still cannot be followed, but for a different reason than before: their id
 * *would* now distinguish them, so this is a product line rather than a technical one — a banner
 * reading "Following Someone" is not worth the confusion.
 */
export function isFollowable(peer: RoomPeer): boolean {
  return peer.name !== ANONYMOUS_PEER_NAME
}

export function findFollowed(
  peers: readonly RoomPeer[],
  peerId: string | null,
): RoomPeer | null {
  if (peerId === null) return null
  return peers.find((peer) => peer.id === peerId) ?? null
}

/** How long a followed peer may be missing from the roster before the follow is dropped. A page
 *  turn is still a disappearance — the socket closes and reopens — so reacting immediately would
 *  end the follow every time it was doing its job, even now that the id on the far side of it is
 *  the same one. */
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

  const heading = toc.find((entry) => entry.section_id === sectionId)?.title.trim() ?? ""

  const page = pages.find((entry) => entry.section_id === sectionId)
  const index = pages.findIndex((entry) => entry.section_id === sectionId)
  const number = page?.page_number ?? (index === -1 ? null : index + 1)

  /** The number leads. A heading alone told the reader which *chapter* somebody was in, which is
   *  not the question being asked of a roster — "page 7" is what you say out loud to catch up
   *  with somebody, and it is what the dock is already showing at the bottom of the screen. The
   *  heading follows it where there is one, and gets truncated first because it is the context
   *  rather than the answer. */
  if (number === null) return heading.length > 0 ? heading : labels.unknown
  return heading.length > 0 ? `${labels.page(number)} · ${heading}` : labels.page(number)
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
