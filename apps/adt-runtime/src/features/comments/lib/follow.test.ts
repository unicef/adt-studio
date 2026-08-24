import { describe, expect, it } from "vitest"
import {
  FOLLOW_GRACE_MS,
  findFollowed,
  followOutcome,
  isFollowable,
  pageLabelFor,
} from "@/features/comments/lib/follow"
import { ANONYMOUS_PEER_NAME, type RoomPeer } from "@/features/comments/lib/room-protocol"
import type { PageEntry, TocEntry } from "@/features/navigation/state/nav.atoms"

function peer(overrides: Partial<RoomPeer> = {}): RoomPeer {
  return {
    id: "socket-1",
    name: "Ana",
    color: "#0091ff",
    is_author: false,
    page_section_id: "pg002_sec001",
    ...overrides,
  }
}

const PAGES: PageEntry[] = [
  { section_id: "pg001_sec001", href: "page-1.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "page-2.html", page_number: 2 },
  { section_id: "pg003_sec001", href: "page-3.html", page_number: 3 },
]

const TOC: TocEntry[] = [
  { section_id: "pg002_sec001", href: "page-2.html", title: "Water and life", chapter_id: "c1" },
]

const LABELS = { unknown: "Somewhere in the book", page: (n: number) => `Page ${n}` }

describe("who can be followed", () => {
  it("refuses the unnamed, who are all the same person as far as the roster knows", () => {
    expect(isFollowable(peer())).toBe(true)
    expect(isFollowable(peer({ name: ANONYMOUS_PEER_NAME }))).toBe(false)
  })

  /** Ids are per socket and a page turn is a reload, so the id of the person being followed
   *  changes at the exact moment the follow has work to do. The name is what survives. */
  it("finds the followed peer by name across a change of socket id", () => {
    const before = findFollowed([peer({ id: "socket-1" })], "Ana")
    const after = findFollowed([peer({ id: "socket-9", page_section_id: "pg003_sec001" })], "Ana")
    expect(before?.id).toBe("socket-1")
    expect(after?.id).toBe("socket-9")
    expect(after?.page_section_id).toBe("pg003_sec001")
  })
})

describe("where a follow sends the reader", () => {
  const base = {
    missingSinceMs: null,
    now: 1_000_000,
    currentSectionId: "pg001_sec001",
    pages: PAGES,
    name: "Ana",
  }

  it("does nothing at all when nobody is being followed", () => {
    expect(followOutcome({ ...base, followed: peer(), name: null }).kind).toBe("idle")
  })

  it("navigates to the page the followed peer is reading", () => {
    expect(followOutcome({ ...base, followed: peer() })).toEqual({
      kind: "navigate",
      href: "page-2.html",
      sectionId: "pg002_sec001",
    })
  })

  it("stays put once both are on the same page", () => {
    expect(
      followOutcome({ ...base, followed: peer(), currentSectionId: "pg002_sec001" }).kind,
    ).toBe("stay")
  })

  /** A page this snapshot has no entry for is not a reason to guess at a URL. */
  it("stays put when the peer is on a page this snapshot does not list", () => {
    expect(
      followOutcome({ ...base, followed: peer({ page_section_id: "pg404_sec001" }) }).kind,
    ).toBe("stay")
  })

  /** Wandering off is not a way to end a follow: the reader gets pulled back, which is what
   *  following means. Only the Stop button ends it. */
  it("pulls the reader back when they wander off on their own", () => {
    expect(
      followOutcome({ ...base, followed: peer(), currentSectionId: "pg003_sec001" }),
    ).toEqual({ kind: "navigate", href: "page-2.html", sectionId: "pg002_sec001" })
  })

  it("waits out a page turn before giving up on a peer who vanished", () => {
    const gone = { ...base, followed: null, missingSinceMs: base.now - 1_000 }
    expect(followOutcome(gone).kind).toBe("stay")

    const long = { ...base, followed: null, missingSinceMs: base.now - FOLLOW_GRACE_MS - 1 }
    expect(followOutcome(long).kind).toBe("lost")
  })
})

describe("saying where somebody is", () => {
  /** The number is what somebody says out loud to catch up with a reader, so it leads; the
   *  heading follows as context and is what truncation eats first. */
  it("leads with the page number and keeps the heading as context", () => {
    expect(pageLabelFor(peer(), PAGES, TOC, LABELS)).toBe("Page 2 · Water and life")
  })

  it("still names the heading when the page itself is not in this snapshot", () => {
    const toc = [{ section_id: "pg404_sec001", href: "x.html", title: "Afterword", chapter_id: "c9" }]
    expect(pageLabelFor(peer({ page_section_id: "pg404_sec001" }), PAGES, toc, LABELS)).toBe(
      "Afterword",
    )
  })

  it("falls back to the page number when the section has no heading", () => {
    expect(pageLabelFor(peer({ page_section_id: "pg003_sec001" }), PAGES, TOC, LABELS)).toBe(
      "Page 3",
    )
  })

  /** Inventing "page 1" for a peer whose page is unknown would be worse than admitting it. */
  it("admits it does not know rather than guessing", () => {
    expect(pageLabelFor(peer({ page_section_id: null }), PAGES, TOC, LABELS)).toBe(
      "Somewhere in the book",
    )
    expect(pageLabelFor(peer({ page_section_id: "pg404_sec001" }), PAGES, TOC, LABELS)).toBe(
      "Somewhere in the book",
    )
  })
})
