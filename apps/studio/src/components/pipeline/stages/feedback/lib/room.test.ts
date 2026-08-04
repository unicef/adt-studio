import { describe, expect, it } from "vitest"
import {
  PUBLICATION_ROOM_CURSOR_STALE_MS,
  type PublishComment,
  type RoomPeer,
} from "@adt/types"
import {
  ROOM_BACKOFF_BASE_MS,
  ROOM_BACKOFF_MAX_MS,
  ROOM_CURSOR_STALE_MS,
  applyCursor,
  backoffDelay,
  otherPeers,
  parseServerFrame,
  pruneCursors,
  upsertComment,
  visibleCursors,
  type ReviewerCursor,
} from "./room"

const PAGE = "pg001_sec001"

const OTHER_PAGE = "pg002_sec001"

function peer(id: string, overrides: Partial<RoomPeer> = {}): RoomPeer {
  return { id, name: id, color: "#0091ff", is_author: false, page_section_id: PAGE, ...overrides }
}

function cursor(peerId: string, at: number, sectionId = PAGE): ReviewerCursor {
  return {
    peerId,
    sectionId,
    selector: "#content [data-id='b3']",
    xOffsetPct: 40,
    yOffsetPct: 20,
    at,
  }
}

function comment(overrides: Partial<PublishComment> = {}): PublishComment {
  return {
    id: "c1",
    token: "abcdefghijklmnopqrstuvwxyz012345",
    version: 2,
    page_section_id: PAGE,
    parent_id: null,
    session_id: "s1",
    author_name: "Maria",
    author_color: "#0091ff",
    body: "bigger raven",
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T12:00:00.000Z",
    ...overrides,
  }
}

describe("the Studio's stale-cursor window", () => {
  it("matches the shared contract", () => {
    expect(ROOM_CURSOR_STALE_MS).toBe(PUBLICATION_ROOM_CURSOR_STALE_MS)
  })
})

describe("backoff", () => {
  it("grows to a cap and is jittered inside its window", () => {
    expect(backoffDelay(0, () => 1)).toBe(ROOM_BACKOFF_BASE_MS)
    expect(backoffDelay(30, () => 1)).toBe(ROOM_BACKOFF_MAX_MS)
    expect(backoffDelay(4, () => 0)).toBe(0)
    expect(backoffDelay(4, () => 0.3)).toBeLessThan(backoffDelay(4, () => 0.9))
  })
})

describe("parsing frames", () => {
  it("accepts what the worker sends", () => {
    expect(parseServerFrame(JSON.stringify({ t: "presence", self_id: "a", peers: [peer("a")] })))
      .not.toBeNull()
    expect(
      parseServerFrame(
        JSON.stringify({
          t: "cursor",
          peer_id: "a",
          section_id: PAGE,
          selector: "#content",
          xOffsetPct: 0,
          yOffsetPct: 100,
        }),
      ),
    ).not.toBeNull()
    expect(parseServerFrame(JSON.stringify({ t: "comment-created", comment: comment() }))).not
      .toBeNull()
  })

  it("returns null rather than throwing on anything else", () => {
    expect(parseServerFrame("{")).toBeNull()
    expect(parseServerFrame(undefined)).toBeNull()
    expect(parseServerFrame(JSON.stringify({ t: "presence" }))).toBeNull()
    expect(parseServerFrame(JSON.stringify({ t: "typing", peer_id: "a" }))).toBeNull()
  })
})

describe("cursor bookkeeping", () => {
  it("keeps one per peer and drops the stale and the departed", () => {
    const moved = applyCursor(applyCursor([], cursor("a", 0)), cursor("a", 500))
    expect(moved).toHaveLength(1)
    expect(moved[0]?.at).toBe(500)

    const kept = pruneCursors([cursor("a", 0), cursor("b", 9_000)], 10_000, new Set(["a", "b"]))
    expect(kept.map((entry) => entry.peerId)).toEqual(["b"])

    const survivors = pruneCursors([cursor("b", 9_000)], 10_000, new Set([]))
    expect(survivors).toEqual([])
  })

  it("shows reviewers on the framed page only, never the author's own peer", () => {
    const peers = [peer("author", { is_author: true }), peer("maria"), peer("ana")]
    const cursors = [cursor("author", 10_000), cursor("maria", 10_000), cursor("ana", 10_000, OTHER_PAGE)]

    const visible = visibleCursors(cursors, peers, "author", PAGE, 10_000)
    expect(visible.map((entry) => entry.peerId)).toEqual(["maria"])
    expect(visible[0]).toMatchObject({ name: "maria", color: "#0091ff" })
  })

  it("draws nothing before the frame reports a page", () => {
    expect(visibleCursors([cursor("maria", 0)], [peer("maria")], null, null, 0)).toEqual([])
  })

  it("relabels a reviewer who renamed themselves, from the roster", () => {
    const visible = visibleCursors(
      [cursor("maria", 10_000)],
      [peer("maria", { name: "Maria Silva", color: "#e5484d" })],
      "author",
      PAGE,
      10_000,
    )
    expect(visible[0]).toMatchObject({ name: "Maria Silva", color: "#e5484d" })
  })
})

describe("otherPeers", () => {
  it("excludes the author's own socket from the roster it reports", () => {
    expect(otherPeers([peer("me"), peer("them")], "me").map((entry) => entry.id)).toEqual(["them"])
  })
})

describe("upserting a comment into the author's cache", () => {
  it("appends a new comment in created_at order", () => {
    const first = comment({ id: "c1", created_at: "2026-08-04T12:00:00.000Z" })
    const late = comment({ id: "c2", created_at: "2026-08-04T13:00:00.000Z" })
    const early = comment({ id: "c0", created_at: "2026-08-04T11:00:00.000Z" })

    expect(upsertComment([first, late], early).map((entry) => entry.id)).toEqual([
      "c0",
      "c1",
      "c2",
    ])
  })

  it("replaces in place, so the poster's own echo is not a duplicate", () => {
    const seeded = [comment()]
    const updated = upsertComment(seeded, comment({ body: "second thoughts" }))

    expect(updated).toHaveLength(1)
    expect(updated[0]?.body).toBe("second thoughts")
  })

  it("keeps resolved and deleted rows — the author's list is deliberately unfiltered", () => {
    const seeded = [comment()]
    const resolved = upsertComment(seeded, comment({ resolved_at: "2026-08-04T13:00:00.000Z" }))
    expect(resolved).toHaveLength(1)

    const deleted = upsertComment(resolved, comment({ deleted_at: "2026-08-04T14:00:00.000Z" }))
    expect(deleted).toHaveLength(1)
    expect(deleted[0]?.deleted_at).not.toBeNull()
  })
})
