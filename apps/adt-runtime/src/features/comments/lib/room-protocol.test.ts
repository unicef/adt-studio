import { describe, expect, it } from "vitest"
import {
  PUBLICATION_ROOM_TAB_PARAM as CONTRACT_TAB_PARAM,
  PUBLICATION_ROOM_TAB_PATTERN as CONTRACT_TAB_PATTERN,
  PUBLICATION_ROOM_CURSOR_STALE_MS,
  PUBLICATION_ROOM_CURSOR_THROTTLE_MS,
  PUBLICATION_ROOM_MAX_PEERS,
  PUBLICATION_ROOM_TICKET_PARAM,
  PUBLISH_ANONYMOUS_COLOR,
  PUBLISH_ANONYMOUS_NAME,
  ROOM_COMMENT_EVENTS,
} from "@adt/types"
import {
  ANONYMOUS_PEER_COLOR,
  ANONYMOUS_PEER_NAME,
  PUBLICATION_ROOM_TAB_PARAM,
  PUBLICATION_ROOM_TAB_PATTERN,
  ROOM_CURSOR_STALE_MS,
  ROOM_CURSOR_THROTTLE_MS,
  ROOM_MAX_PEERS,
  ROOM_TICKET_PARAM,
  isCommentEvent,
  parseServerFrame,
} from "@/features/comments/lib/room-protocol"

/**
 * The runtime restates these rather than importing them, so that zod never reaches a published
 * book's bundle. This is the test that makes the restatement safe.
 */
describe("no drift from the shared contract", () => {
  it("matches @adt/types", () => {
    expect(ROOM_MAX_PEERS).toBe(PUBLICATION_ROOM_MAX_PEERS)
    expect(ROOM_CURSOR_THROTTLE_MS).toBe(PUBLICATION_ROOM_CURSOR_THROTTLE_MS)
    expect(ROOM_CURSOR_STALE_MS).toBe(PUBLICATION_ROOM_CURSOR_STALE_MS)
    expect(ROOM_TICKET_PARAM).toBe(PUBLICATION_ROOM_TICKET_PARAM)
    expect(PUBLICATION_ROOM_TAB_PARAM).toBe(CONTRACT_TAB_PARAM)
    expect(PUBLICATION_ROOM_TAB_PATTERN.source).toBe(CONTRACT_TAB_PATTERN.source)
    expect(ANONYMOUS_PEER_NAME).toBe(PUBLISH_ANONYMOUS_NAME)
    expect(ANONYMOUS_PEER_COLOR).toBe(PUBLISH_ANONYMOUS_COLOR)
  })

  it("knows every comment event the worker can broadcast", () => {
    for (const event of ROOM_COMMENT_EVENTS) {
      expect(isCommentEvent(event), event).toBe(true)
    }
    expect(isCommentEvent("comment-invented")).toBe(false)
  })
})

const PEER = {
  id: "p1",
  name: "Maria",
  color: "#0091ff",
  is_author: false,
  page_section_id: "pg001_sec001",
}

const CURSOR = {
  t: "cursor",
  peer_id: "p1",
  section_id: "pg001_sec001",
  selector: "#content [data-id='b3']",
  xOffsetPct: 40,
  yOffsetPct: 0,
}

const COMMENT = {
  id: "c1",
  page_section_id: "pg001_sec001",
  parent_id: null,
  author_name: "Maria",
  author_color: "#0091ff",
  body: "bigger raven",
}

function parse(payload: unknown): ReturnType<typeof parseServerFrame> {
  return parseServerFrame(JSON.stringify(payload))
}

describe("parsing server frames", () => {
  it("accepts a roster", () => {
    expect(parse({ t: "presence", self_id: "p1", peers: [PEER] })).toEqual({
      t: "presence",
      self_id: "p1",
      peers: [PEER],
    })
    expect(parse({ t: "presence", self_id: "p1", peers: [] })?.t).toBe("presence")
    expect(parse({ t: "presence", self_id: "p1", peers: [{ ...PEER, page_section_id: null }] })).not
      .toBeNull()
  })

  it("accepts a relayed cursor, including a zero offset", () => {
    expect(parse(CURSOR)).toEqual(CURSOR)
    expect(parse({ ...CURSOR, xOffsetPct: 100, yOffsetPct: 0 })).not.toBeNull()
  })

  it("accepts a comment event", () => {
    for (const event of ROOM_COMMENT_EVENTS) {
      expect(parse({ t: event, comment: COMMENT })?.t, event).toBe(event)
    }
  })

  it("rejects anything malformed rather than throwing", () => {
    expect(parseServerFrame("not json")).toBeNull()
    expect(parseServerFrame(undefined)).toBeNull()
    expect(parseServerFrame(new ArrayBuffer(4))).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse([])).toBeNull()
    expect(parse({})).toBeNull()
    expect(parse({ t: "presence", self_id: "p1" })).toBeNull()
    expect(parse({ t: "presence", self_id: "", peers: [] })).toBeNull()
    expect(parse({ t: "presence", self_id: "p1", peers: [{ id: "p1" }] })).toBeNull()
    expect(parse({ ...CURSOR, xOffsetPct: 101 })).toBeNull()
    expect(parse({ ...CURSOR, yOffsetPct: Number.NaN })).toBeNull()
    expect(parse({ ...CURSOR, peer_id: "" })).toBeNull()
    expect(parse({ t: "comment-created" })).toBeNull()
    expect(parse({ t: "comment-created", comment: { id: "c1" } })).toBeNull()
  })

  it("ignores a frame type it has never heard of, so a newer worker is not a broken reader", () => {
    expect(parse({ t: "typing", peer_id: "p1" })).toBeNull()
  })
})
