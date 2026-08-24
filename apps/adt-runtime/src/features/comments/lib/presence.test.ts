import { describe, expect, it } from "vitest"
import type { PublishComment } from "@/features/comments/lib/contract"
import {
  applyCommentFrame,
  applyCursor,
  CURSOR_OFFSCREEN_STALE_MS,
  cursorFromFrame,
  otherPeers,
  pruneCursors,
  visibleCursors,
  type PeerCursor,
} from "@/features/comments/lib/presence"
import { ROOM_CURSOR_STALE_MS } from "@/features/comments/lib/room-protocol"
import type { RoomPeer, RoomPeerCursorFrame } from "@/features/comments/lib/room-protocol"

const PAGE = "pg001_sec001"

const OTHER_PAGE = "pg002_sec001"

function peer(id: string, overrides: Partial<RoomPeer> = {}): RoomPeer {
  return {
    id,
    name: id,
    color: "#0091ff",
    is_author: false,
    page_section_id: PAGE,
    ...overrides,
  }
}

function frame(peerId: string, overrides: Partial<RoomPeerCursorFrame> = {}): RoomPeerCursorFrame {
  return {
    t: "cursor",
    peer_id: peerId,
    section_id: PAGE,
    selector: "#content [data-id='b3']",
    xOffsetPct: 40,
    yOffsetPct: 20,
    ...overrides,
  }
}

function cursor(peerId: string, at: number, sectionId = PAGE): PeerCursor {
  return cursorFromFrame(frame(peerId, { section_id: sectionId }), at)
}

function comment(overrides: Partial<PublishComment> = {}): PublishComment {
  return {
    id: "c1",
    token: "tokenAbcdefghijklmnopqrstuvwx",
    version: 1,
    page_section_id: PAGE,
    parent_id: null,
    session_id: "s1",
    author_name: "Maria",
    author_color: "#0091ff",
    body: "The raven should be bigger",
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T12:00:00.000Z",
    ...overrides,
  }
}

describe("cursor bookkeeping", () => {
  it("keeps one cursor per peer, newest wins", () => {
    const first = applyCursor([], cursor("a", 100))
    const second = applyCursor(first, cursor("b", 110))
    const moved = applyCursor(second, cursorFromFrame(frame("a", { xOffsetPct: 90 }), 120))

    expect(moved).toHaveLength(2)
    expect(moved.find((entry) => entry.peerId === "a")).toMatchObject({ xOffsetPct: 90, at: 120 })
  })

  it("drops cursors that went stale or whose peer left the room", () => {
    const cursors = [cursor("stale", 0), cursor("gone", 9_000), cursor("here", 9_000)]
    const kept = pruneCursors(cursors, 10_000, new Set(["stale", "here"]), 5000)

    expect(kept.map((entry) => entry.peerId)).toEqual(["here"])
  })

  it("returns the same array when nothing needed pruning", () => {
    const cursors = [cursor("here", 9_500)]
    expect(pruneCursors(cursors, 10_000, new Set(["here"]), 5000)).toBe(cursors)
  })
})

describe("visible cursors", () => {
  const peers = [peer("me"), peer("them"), peer("elsewhere", { page_section_id: OTHER_PAGE })]
  const cursors = [
    cursor("me", 10_000),
    cursor("them", 10_000),
    cursor("elsewhere", 10_000, OTHER_PAGE),
  ]

  it("never draws the reader's own cursor", () => {
    const visible = visibleCursors(cursors, peers, "me", PAGE, 10_000)
    expect(visible.map((entry) => entry.peer.id)).toEqual(["them"])
  })

  it("hides a peer pointing at another page", () => {
    const visible = visibleCursors(cursors, peers, null, OTHER_PAGE, 10_000)
    expect(visible.map((entry) => entry.peer.id)).toEqual(["elsewhere"])
  })

  it("hides a peer who is no longer on the roster", () => {
    const visible = visibleCursors(cursors, [peer("me")], "me", PAGE, 10_000)
    expect(visible).toEqual([])
  })

  it("draws nothing before the page is known", () => {
    expect(visibleCursors(cursors, peers, "me", null, 10_000)).toEqual([])
  })

  it("carries the peer's live name and color, not the cursor's", () => {
    const renamed = [peer("them", { name: "Ana", color: "#e5484d" })]
    const visible = visibleCursors([cursor("them", 10_000)], renamed, "me", PAGE, 10_000)
    expect(visible[0]?.peer).toMatchObject({ name: "Ana", color: "#e5484d" })
  })
})

describe("otherPeers", () => {
  it("counts everyone but the reader", () => {
    expect(otherPeers([peer("me"), peer("them")], "me").map((entry) => entry.id)).toEqual(["them"])
    expect(otherPeers([peer("me")], "me")).toEqual([])
    expect(otherPeers([peer("me")], null)).toHaveLength(1)
  })
})

describe("applying a comment event to the page's list", () => {
  const options = { sectionId: PAGE, showResolved: false }

  it("adds a new root and reports it for the pin animation", () => {
    const outcome = applyCommentFrame([], comment(), options)

    expect(outcome.changed).toBe(true)
    expect(outcome.comments).toHaveLength(1)
    expect(outcome.arrivedRootId).toBe("c1")
  })

  it("ignores an event for another page", () => {
    const existing = [comment()]
    const outcome = applyCommentFrame(
      existing,
      comment({ id: "c2", page_section_id: OTHER_PAGE }),
      options,
    )

    expect(outcome.changed).toBe(false)
    expect(outcome.comments).toBe(existing)
  })

  it("is idempotent, so the poster's own echo is not a duplicate", () => {
    const first = applyCommentFrame([], comment(), options)
    const again = applyCommentFrame(first.comments, comment(), options)

    expect(again.changed).toBe(false)
    expect(again.comments).toHaveLength(1)
  })

  it("replaces an edited comment in place without re-animating it", () => {
    const seeded = applyCommentFrame([], comment(), options).comments
    const outcome = applyCommentFrame(
      seeded,
      comment({ body: "second thoughts", edited_at: "2026-08-04T12:05:00.000Z" }),
      options,
    )

    expect(outcome.changed).toBe(true)
    expect(outcome.arrivedRootId).toBeNull()
    expect(outcome.comments[0]?.body).toBe("second thoughts")
  })

  it("adds a reply under a root it already has", () => {
    const seeded = applyCommentFrame([], comment(), options).comments
    const outcome = applyCommentFrame(
      seeded,
      comment({ id: "r1", parent_id: "c1", body: "agreed" }),
      options,
    )

    expect(outcome.comments.map((entry) => entry.id)).toEqual(["c1", "r1"])
    expect(outcome.arrivedRootId).toBeNull()
  })

  it("takes a resolved thread off screen with its replies", () => {
    let comments = applyCommentFrame([], comment(), options).comments
    comments = applyCommentFrame(comments, comment({ id: "r1", parent_id: "c1" }), options).comments
    expect(comments).toHaveLength(2)

    const resolved = applyCommentFrame(
      comments,
      comment({ resolved_at: "2026-08-04T13:00:00.000Z" }),
      options,
    )
    expect(resolved.comments).toEqual([])
  })

  it("keeps a resolved thread when the reader asked to see resolved ones", () => {
    const seeded = applyCommentFrame([], comment(), options).comments
    const resolved = applyCommentFrame(
      seeded,
      comment({ resolved_at: "2026-08-04T13:00:00.000Z" }),
      { sectionId: PAGE, showResolved: true },
    )

    expect(resolved.comments).toHaveLength(1)
    expect(resolved.comments[0]?.resolved_at).not.toBeNull()
  })

  it("brings a reopened thread back", () => {
    const outcome = applyCommentFrame([], comment(), options)
    expect(outcome.comments).toHaveLength(1)

    const reopened = applyCommentFrame([], comment({ resolved_at: null }), options)
    expect(reopened.comments).toHaveLength(1)
    expect(reopened.arrivedRootId).toBe("c1")
  })

  it("removes a deleted comment and its orphaned replies", () => {
    let comments = applyCommentFrame([], comment(), options).comments
    comments = applyCommentFrame(comments, comment({ id: "r1", parent_id: "c1" }), options).comments

    const deleted = applyCommentFrame(
      comments,
      comment({ deleted_at: "2026-08-04T13:00:00.000Z" }),
      options,
    )
    expect(deleted.changed).toBe(true)
    expect(deleted.comments).toEqual([])
  })

  it("never animates a comment that arrives already deleted", () => {
    const outcome = applyCommentFrame(
      [],
      comment({ deleted_at: "2026-08-04T13:00:00.000Z" }),
      options,
    )
    expect(outcome.arrivedRootId).toBeNull()
    expect(outcome.comments).toEqual([])
  })
})

describe("cursor lifetimes", () => {
  /** The bug this pair of windows fixes: an off-screen peer is by definition somebody who has
   *  stopped moving their pointer, so filtering at the arrow's window discarded exactly the
   *  people the edge markers exist to show — nothing appeared at all. */
  it("keeps a still peer's cursor long past the window an arrow would use", () => {
    const now = 1_000_000
    const cursor = {
      peerId: "p1",
      sectionId: "pg005_sec001",
      selector: "#content [data-id='n1']",
      xOffsetPct: 50,
      yOffsetPct: 50,
      at: now - 20_000,
    }
    const peers = [
      { id: "p1", name: "Ana", color: "#0091ff", is_author: false, page_section_id: "pg005_sec001" },
    ]

    expect(
      visibleCursors([cursor], peers, "me", "pg005_sec001", now, ROOM_CURSOR_STALE_MS),
    ).toEqual([])

    expect(
      visibleCursors([cursor], peers, "me", "pg005_sec001", now, CURSOR_OFFSCREEN_STALE_MS),
    ).toHaveLength(1)
  })

  it("still forgets a peer who has been gone for a minute", () => {
    const now = 1_000_000
    const cursor = {
      peerId: "p1",
      sectionId: "pg005_sec001",
      selector: "#content [data-id='n1']",
      xOffsetPct: 50,
      yOffsetPct: 50,
      at: now - 60_000,
    }
    const peers = [
      { id: "p1", name: "Ana", color: "#0091ff", is_author: false, page_section_id: "pg005_sec001" },
    ]
    expect(
      visibleCursors([cursor], peers, "me", "pg005_sec001", now, CURSOR_OFFSCREEN_STALE_MS),
    ).toEqual([])
  })

  it("prunes state at the longer window, so the overlay still has something to draw", () => {
    const now = 1_000_000
    const cursors = [
      { peerId: "p1", sectionId: "s", selector: "a", xOffsetPct: 1, yOffsetPct: 1, at: now - 20_000 },
      { peerId: "p2", sectionId: "s", selector: "b", xOffsetPct: 1, yOffsetPct: 1, at: now - 60_000 },
    ]
    const kept = pruneCursors(cursors, now, new Set(["p1", "p2"]), CURSOR_OFFSCREEN_STALE_MS)
    expect(kept.map((cursor) => cursor.peerId)).toEqual(["p1"])
  })
})
