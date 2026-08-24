import type { PublishComment } from "@/features/comments/lib/contract"
import {
  ROOM_CURSOR_STALE_MS,
  type RoomPeer,
  type RoomPeerCursorFrame,
} from "@/features/comments/lib/room-protocol"

/**
 * The pure half of presence: everything that decides *what* is on screen, with no DOM, no
 * socket and no clock of its own. The hook feeds it frames and a timestamp; the components
 * render what comes back.
 */

export interface PeerCursor {
  peerId: string
  sectionId: string
  selector: string
  xOffsetPct: number
  yOffsetPct: number
  /** When the last frame for this peer arrived. Cursors have no goodbye frame — a pointer that
   *  leaves the window, a sleeping laptop and a half-dead socket all just stop reporting — so
   *  staleness is the only honest way to stop drawing one. */
  at: number
}

export interface VisibleCursor {
  cursor: PeerCursor
  peer: RoomPeer
}

export function cursorFromFrame(frame: RoomPeerCursorFrame, at: number): PeerCursor {
  return {
    peerId: frame.peer_id,
    sectionId: frame.section_id,
    selector: frame.selector,
    xOffsetPct: frame.xOffsetPct,
    yOffsetPct: frame.yOffsetPct,
    at,
  }
}

/** One cursor per peer, newest wins. */
export function applyCursor(cursors: PeerCursor[], next: PeerCursor): PeerCursor[] {
  const index = cursors.findIndex((cursor) => cursor.peerId === next.peerId)
  if (index === -1) return [...cursors, next]
  const updated = [...cursors]
  updated[index] = next
  return updated
}

/**
 * How long an *off-screen* peer keeps their edge marker.
 *
 * Longer than the arrow because the two claim different things. An arrow says "pointing here,
 * now", which stops being true almost immediately once someone stops moving — five seconds is
 * right. An edge marker says "reading somewhere down there", which stays true while they sit and
 * read, and a reader who is still is the normal case rather than the exception. Held to under a
 * minute so somebody who closed the tab mid-sentence does not haunt the edge of the page.
 *
 * Deliberately *not* in `room-protocol.ts`: the constants there mirror the wire contract in
 * `@adt/types` and are drift-tested against it. This one is a drawing decision the worker has no
 * opinion about, so putting it there would imply agreement that nothing else needs.
 */
export const CURSOR_OFFSCREEN_STALE_MS = 45000

export function pruneCursors(
  cursors: PeerCursor[],
  now: number,
  peerIds: ReadonlySet<string>,
  staleMs: number = ROOM_CURSOR_STALE_MS,
): PeerCursor[] {
  const kept = cursors.filter(
    (cursor) => now - cursor.at < staleMs && peerIds.has(cursor.peerId),
  )
  return kept.length === cursors.length ? cursors : kept
}

/**
 * A cursor is drawn only when its peer is still in the room, is not the reader themselves, and
 * is pointing at the page the reader is on. The worker already relays same-page only; this is
 * the client's half of the same rule, for the window between a peer turning the page and the
 * roster that says so.
 */
export function visibleCursors(
  cursors: PeerCursor[],
  peers: RoomPeer[],
  selfId: string | null,
  sectionId: string | null,
  now: number,
  staleMs: number = ROOM_CURSOR_STALE_MS,
): VisibleCursor[] {
  if (sectionId === null) return []
  const byId = new Map(peers.map((peer) => [peer.id, peer]))
  const visible: VisibleCursor[] = []
  for (const cursor of cursors) {
    if (cursor.peerId === selfId) continue
    if (cursor.sectionId !== sectionId) continue
    if (now - cursor.at >= staleMs) continue
    const peer = byId.get(cursor.peerId)
    if (!peer) continue
    visible.push({ cursor, peer })
  }
  return visible
}

/**
 * How long somebody stays on the roster after their socket goes quiet.
 *
 * A page turn in a published book is a document reload, so it reaches the room as a departure
 * followed a heartbeat later by an arrival. Reporting that faithfully is what made everyone
 * blink out of the list every time they turned a page. `FOLLOW_GRACE_MS` already exists for the
 * same reason on the same event; this is the roster's version of it, and shorter, because
 * showing somebody who really has left is a smaller lie than losing somebody you are following.
 */
export const PRESENCE_GRACE_MS = 8000

export interface SeenPeer {
  peer: RoomPeer
  /** When this peer first appeared, which is what the list is ordered by. Kept across their
   *  reconnections so turning a page does not move them. */
  firstSeenMs?: number
  lastSeenMs: number
}

/**
 * Who to show, given who the room says is connected and who it said a moment ago.
 *
 * Live peers are always shown and their clock is reset. Anybody who has just dropped out is
 * carried for `graceMs` — long enough to cover a reload, short enough that a closed tab is not
 * advertised for a whole minute. A peer who returns within the window is simply live again, and
 * because their id now survives a page turn, "returns" means the same person rather than a
 * stranger who happens to share a name.
 *
 * Pure, and takes `now`, so the awkward part — what is still lingering and what has finally
 * gone — is testable without waiting for real time to pass.
 */
export function stickyRoster(
  live: readonly RoomPeer[],
  seen: readonly SeenPeer[],
  now: number,
  graceMs: number = PRESENCE_GRACE_MS,
): { display: RoomPeer[]; seen: SeenPeer[] } {
  const liveIds = new Set(live.map((peer) => peer.id))
  const known = new Map(seen.map((entry) => [entry.peer.id, entry]))
  const lingering = seen.filter(
    (entry) => !liveIds.has(entry.peer.id) && now - entry.lastSeenMs < graceMs,
  )

  const next: SeenPeer[] = [
    ...live.map((peer) => {
      const previous = known.get(peer.id)
      return {
        peer,
        /** Carried over, never reset. The room reports whoever is connected in socket order, so a
         *  reader who turns a page comes back at the *end* of it — which is why the list kept
         *  reshuffling under people. Ordering on first sight instead keeps everybody where the
         *  reader last saw them. */
        firstSeenMs: previous?.firstSeenMs ?? previous?.lastSeenMs ?? now,
        lastSeenMs: now,
      }
    }),
    ...lingering,
  ]

  const order = (entry: SeenPeer): number => entry.firstSeenMs ?? entry.lastSeenMs
  const display = [...next]
    .sort((a, b) => order(a) - order(b) || a.peer.id.localeCompare(b.peer.id))
    .map((entry) => entry.peer)

  return { display, seen: next }
}

/** Everyone but the reader. "3 people here" counts the others; the reader knows they are here. */
export function otherPeers(peers: RoomPeer[], selfId: string | null): RoomPeer[] {
  return peers.filter((peer) => peer.id !== selfId)
}

export interface CommentFrameOutcome {
  comments: PublishComment[]
  /** A root that just appeared on the page being read, for the pin's arrival animation. */
  arrivedRootId: string | null
  changed: boolean
}

/**
 * A comment event applied to the page's list in place, instead of a refetch.
 *
 * Thread visibility follows the worker's own rule exactly (`filterCommentThreads`): the root
 * governs, so resolving a root takes its replies off screen with it and un-resolving brings
 * them back. Anything for another page is ignored — the reader's list is per page, and the
 * frame will be waiting in the list request when they turn to it.
 */
export function applyCommentFrame(
  comments: PublishComment[],
  comment: PublishComment,
  options: { sectionId: string | null; showResolved: boolean },
): CommentFrameOutcome {
  const unchanged: CommentFrameOutcome = { comments, arrivedRootId: null, changed: false }
  if (options.sectionId === null || comment.page_section_id !== options.sectionId) return unchanged

  const index = comments.findIndex((candidate) => candidate.id === comment.id)
  const merged = index === -1 ? [...comments, comment] : replaceAt(comments, index, comment)
  const next = filterThreads(merged, options.showResolved)

  if (sameIds(comments, next) && index !== -1 && same(comments[index], comment)) return unchanged

  const arrived =
    comment.parent_id === null &&
    comment.deleted_at === null &&
    next.some((candidate) => candidate.id === comment.id) &&
    !comments.some((candidate) => candidate.id === comment.id)

  return { comments: next, arrivedRootId: arrived ? comment.id : null, changed: true }
}

function replaceAt(
  comments: PublishComment[],
  index: number,
  comment: PublishComment,
): PublishComment[] {
  const updated = [...comments]
  updated[index] = comment
  return updated
}

function filterThreads(comments: PublishComment[], showResolved: boolean): PublishComment[] {
  const roots = new Set<string>()
  for (const comment of comments) {
    if (comment.parent_id !== null) continue
    if (comment.deleted_at !== null) continue
    if (!showResolved && comment.resolved_at !== null) continue
    roots.add(comment.id)
  }
  return comments.filter((comment) =>
    comment.parent_id === null
      ? roots.has(comment.id)
      : roots.has(comment.parent_id) && comment.deleted_at === null,
  )
}

function sameIds(a: PublishComment[], b: PublishComment[]): boolean {
  if (a.length !== b.length) return false
  return a.every((comment, index) => comment.id === b[index]?.id)
}

function same(a: PublishComment | undefined, b: PublishComment): boolean {
  if (!a) return false
  return (
    a.body === b.body &&
    a.resolved_at === b.resolved_at &&
    a.edited_at === b.edited_at &&
    a.deleted_at === b.deleted_at &&
    a.author_name === b.author_name &&
    JSON.stringify(a.anchor) === JSON.stringify(b.anchor)
  )
}
