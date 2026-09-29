import { describe, expect, it } from "vitest"
import {
  PUBLICATION_ROOM_TICKET_TTL_SECONDS,
  RoomClientFrame,
  RoomServerFrame,
} from "@adt/types"
import { signRoomTicket, verifyRoomTicket } from "./room-ticket.js"

const SECRET = "local-dev-secret"

const TOKEN = "roomTicketTokenAbcdefghijklmnop"

const NOW = new Date("2026-08-04T12:00:00.000Z")

function at(offsetSeconds: number): Date {
  return new Date(NOW.getTime() + offsetSeconds * 1000)
}

describe("room tickets", () => {
  it("round-trips a ticket it just signed", async () => {
    const { ticket, expiresAt } = await signRoomTicket(TOKEN, SECRET, NOW)

    expect(await verifyRoomTicket(ticket, TOKEN, SECRET, NOW)).toBe(true)
    expect(Date.parse(expiresAt) - NOW.getTime()).toBe(PUBLICATION_ROOM_TICKET_TTL_SECONDS * 1000)
  })

  it("expires exactly at its stated expiry", async () => {
    const { ticket } = await signRoomTicket(TOKEN, SECRET, NOW)

    expect(await verifyRoomTicket(ticket, TOKEN, SECRET, at(59))).toBe(true)
    expect(
      await verifyRoomTicket(ticket, TOKEN, SECRET, at(PUBLICATION_ROOM_TICKET_TTL_SECONDS)),
    ).toBe(false)
    expect(await verifyRoomTicket(ticket, TOKEN, SECRET, at(3600))).toBe(false)
  })

  it("is bound to its publication, its secret and its own expiry", async () => {
    const { ticket } = await signRoomTicket(TOKEN, SECRET, NOW)
    const [version, expiry, nonce, tag] = ticket.split(".") as [string, string, string, string]

    expect(await verifyRoomTicket(ticket, "anotherTokenAbcdefghijklmnopqr", SECRET, NOW)).toBe(
      false,
    )
    expect(await verifyRoomTicket(ticket, TOKEN, "rotated-secret", NOW)).toBe(false)
    /** Pushing the expiry out is what an attacker would try first, and the tag covers it. */
    expect(
      await verifyRoomTicket(
        [version, String(Number(expiry) + 3600), nonce, tag].join("."),
        TOKEN,
        SECRET,
        at(600),
      ),
    ).toBe(false)
  })

  it("is a fresh value every time, so one is never a lookup key for another", async () => {
    const first = await signRoomTicket(TOKEN, SECRET, NOW)
    const second = await signRoomTicket(TOKEN, SECRET, NOW)

    expect(first.ticket).not.toBe(second.ticket)
    expect(await verifyRoomTicket(second.ticket, TOKEN, SECRET, NOW)).toBe(true)
  })

  it("refuses structurally broken input without throwing", async () => {
    const cases = ["", "v1", "v1.a.b.c.d", "v2.1893456000.n.t", "v1.notanumber.n.t", "v1.-1.n.t"]
    for (const value of cases) {
      expect(await verifyRoomTicket(value, TOKEN, SECRET, NOW), value).toBe(false)
    }
    expect(await verifyRoomTicket(null, TOKEN, SECRET, NOW)).toBe(false)
    expect(await verifyRoomTicket(undefined, TOKEN, SECRET, NOW)).toBe(false)
  })

  it("cannot verify anything on a worker with no MGMT_SECRET", async () => {
    const { ticket } = await signRoomTicket(TOKEN, SECRET, NOW)
    expect(await verifyRoomTicket(ticket, TOKEN, undefined, NOW)).toBe(false)
  })

  it("compares the tag in constant time", async () => {
    const { ticket } = await signRoomTicket(TOKEN, SECRET, NOW)
    const [version, expiry, nonce, tag] = ticket.split(".") as [string, string, string, string]

    /** A tag that shares every character but the last must be as wrong as one that shares
     *  none, and must not throw on a length mismatch either. */
    const nearMiss = `${tag.slice(0, -1)}${tag.endsWith("A") ? "B" : "A"}`
    expect(await verifyRoomTicket([version, expiry, nonce, nearMiss].join("."), TOKEN, SECRET, NOW)).toBe(
      false,
    )
    expect(await verifyRoomTicket([version, expiry, nonce, "A"].join("."), TOKEN, SECRET, NOW)).toBe(
      false,
    )
  })
})

describe("client frames", () => {
  const CURSOR = {
    t: "cursor",
    section_id: "pg001_sec001",
    selector: "#content [data-id='b3']",
    xOffsetPct: 42.5,
    yOffsetPct: 0,
  }

  it("accepts the three frames a reader sends", () => {
    expect(RoomClientFrame.safeParse({ t: "hello" }).success).toBe(true)
    expect(RoomClientFrame.safeParse({ t: "hello", section_id: "pg001_sec001" }).success).toBe(true)
    expect(RoomClientFrame.safeParse({ t: "hello", section_id: null }).success).toBe(true)
    expect(RoomClientFrame.safeParse({ t: "page", section_id: null }).success).toBe(true)
    expect(RoomClientFrame.safeParse(CURSOR).success).toBe(true)
  })

  it("rejects a cursor that would resolve to nothing or to nowhere", () => {
    expect(RoomClientFrame.safeParse({ ...CURSOR, selector: "" }).success).toBe(false)
    expect(RoomClientFrame.safeParse({ ...CURSOR, xOffsetPct: 101 }).success).toBe(false)
    expect(RoomClientFrame.safeParse({ ...CURSOR, yOffsetPct: -1 }).success).toBe(false)
    expect(RoomClientFrame.safeParse({ ...CURSOR, section_id: "" }).success).toBe(false)
    expect(RoomClientFrame.safeParse({ ...CURSOR, selector: "a".repeat(513) }).success).toBe(false)
    const { section_id: _dropped, ...withoutSection } = CURSOR
    expect(RoomClientFrame.safeParse(withoutSection).success).toBe(false)
  })

  it("rejects anything a reader must not be able to assert", () => {
    /** Identity in particular: a name in a client frame would be a name anyone could borrow. */
    const parsed = RoomClientFrame.safeParse({ t: "hello", name: "Someone else", is_author: true })
    expect(parsed.success).toBe(true)
    expect(parsed.success && "name" in parsed.data).toBe(false)

    expect(RoomClientFrame.safeParse({ t: "presence", peers: [] }).success).toBe(false)
    expect(RoomClientFrame.safeParse({ t: "comment-created", comment: {} }).success).toBe(false)
    expect(RoomClientFrame.safeParse({}).success).toBe(false)
    expect(RoomClientFrame.safeParse(null).success).toBe(false)
    expect(RoomClientFrame.safeParse("hello").success).toBe(false)
  })
})

describe("server frames", () => {
  it("accepts a roster and a relayed cursor", () => {
    expect(
      RoomServerFrame.safeParse({
        t: "presence",
        self_id: "abc",
        peers: [
          {
            id: "abc",
            name: "Maria",
            color: "#0091ff",
            is_author: false,
            page_section_id: "pg001_sec001",
          },
        ],
      }).success,
    ).toBe(true)

    expect(
      RoomServerFrame.safeParse({
        t: "cursor",
        peer_id: "abc",
        section_id: "pg001_sec001",
        selector: "#content",
        xOffsetPct: 50,
        yOffsetPct: 50,
      }).success,
    ).toBe(true)
  })

  it("rejects a comment frame whose payload is not a comment", () => {
    expect(RoomServerFrame.safeParse({ t: "comment-created" }).success).toBe(false)
    expect(RoomServerFrame.safeParse({ t: "comment-created", comment: { id: "c1" } }).success).toBe(
      false,
    )
    expect(RoomServerFrame.safeParse({ t: "comment-invented", comment: {} }).success).toBe(false)
  })

  it("rejects a peer whose color could not be drawn", () => {
    expect(
      RoomServerFrame.safeParse({
        t: "presence",
        self_id: "abc",
        peers: [{ id: "abc", name: "Maria", color: "red", is_author: false, page_section_id: null }],
      }).success,
    ).toBe(false)
  })
})
