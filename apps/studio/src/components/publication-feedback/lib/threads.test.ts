import { describe, expect, it } from "vitest"
import type { PublishComment } from "@/api/client"
import {
  buildThreads,
  filterThreads,
  firstPageWithFeedback,
  groupThreadsByPage,
  pinNumbers,
  readableTextColor,
  relativeAge,
  snippet,
  unresolvedThreadCount,
} from "./threads"

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"

function comment(overrides: Partial<PublishComment> & { id: string }): PublishComment {
  return {
    token: TOKEN,
    version: 1,
    page_section_id: "pg001_sec001",
    parent_id: null,
    session_id: "session-1",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "Something to look at",
    anchor: { selector: "#content [data-id=\"a\"]", xOffsetPct: 50, yOffsetPct: 50 },
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

const PAGES = [
  { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
]

describe("buildThreads", () => {
  it("nests replies under their root and orders them oldest first", () => {
    const threads = buildThreads([
      comment({ id: "root" }),
      comment({ id: "r2", parent_id: "root", created_at: "2026-08-04T12:00:00.000Z" }),
      comment({ id: "r1", parent_id: "root", created_at: "2026-08-04T11:00:00.000Z" }),
    ])

    expect(threads).toHaveLength(1)
    expect(threads[0]?.replies.map((reply) => reply.id)).toEqual(["r1", "r2"])
    expect(threads[0]?.replyCount).toBe(2)
  })

  it("does not count a deleted reply, but keeps it for its placeholder", () => {
    const threads = buildThreads([
      comment({ id: "root" }),
      comment({ id: "gone", parent_id: "root", deleted_at: "2026-08-04T12:00:00.000Z" }),
    ])
    expect(threads[0]?.replyCount).toBe(0)
    expect(threads[0]?.replies).toHaveLength(1)
  })

  it("reads resolution and version off the root", () => {
    const threads = buildThreads([
      comment({ id: "root", version: 2, resolved_at: "2026-08-04T13:00:00.000Z" }),
      comment({ id: "reply", parent_id: "root", version: 3 }),
    ])
    expect(threads[0]?.resolved).toBe(true)
    expect(threads[0]?.version).toBe(2)
  })

  it("takes the newest write anywhere in the thread as its activity", () => {
    const threads = buildThreads([
      comment({ id: "root", created_at: "2026-08-01T10:00:00.000Z" }),
      comment({ id: "reply", parent_id: "root", created_at: "2026-08-03T10:00:00.000Z" }),
    ])
    expect(threads[0]?.lastActivityAt).toBe(Date.parse("2026-08-03T10:00:00.000Z"))
  })
})

describe("filterThreads", () => {
  const threads = buildThreads([
    comment({ id: "open" }),
    comment({ id: "closed", resolved_at: "2026-08-04T13:00:00.000Z" }),
    comment({ id: "other-page", page_section_id: "pg002_sec001" }),
  ])

  it("hides resolved threads by default", () => {
    const visible = filterThreads(threads, { resolution: "unresolved", pageSectionId: null })
    expect(visible.map((thread) => thread.root.id)).toEqual(["open", "other-page"])
  })

  it("includes resolved threads when asked", () => {
    const visible = filterThreads(threads, { resolution: "all", pageSectionId: null })
    expect(visible).toHaveLength(3)
  })

  it("narrows to one page", () => {
    const visible = filterThreads(threads, {
      resolution: "all",
      pageSectionId: "pg002_sec001",
    })
    expect(visible.map((thread) => thread.root.id)).toEqual(["other-page"])
  })
})

describe("groupThreadsByPage", () => {
  it("follows the manifest order and sorts newest activity first inside a page", () => {
    const threads = buildThreads([
      comment({ id: "old", created_at: "2026-08-01T10:00:00.000Z" }),
      comment({ id: "new", created_at: "2026-08-04T10:00:00.000Z" }),
      comment({ id: "page-two", page_section_id: "pg002_sec001" }),
    ])
    const groups = groupThreadsByPage(threads, PAGES)

    expect(groups.map((group) => group.pageSectionId)).toEqual([
      "pg001_sec001",
      "pg002_sec001",
    ])
    expect(groups[0]?.threads.map((thread) => thread.root.id)).toEqual(["new", "old"])
  })

  it("keeps a thread whose page is no longer published, in a group of its own", () => {
    const threads = buildThreads([comment({ id: "orphan", page_section_id: "pg099_sec001" })])
    const groups = groupThreadsByPage(threads, PAGES)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.page).toBeNull()
  })

  it("omits pages with nothing on them", () => {
    const threads = buildThreads([comment({ id: "only" })])
    expect(groupThreadsByPage(threads, PAGES)).toHaveLength(1)
  })
})

describe("unresolvedThreadCount", () => {
  it("counts open roots only, ignoring replies and deleted roots", () => {
    const count = unresolvedThreadCount([
      comment({ id: "open" }),
      comment({ id: "reply", parent_id: "open" }),
      comment({ id: "closed", resolved_at: "2026-08-04T13:00:00.000Z" }),
      comment({ id: "gone", deleted_at: "2026-08-04T13:00:00.000Z" }),
    ])
    expect(count).toBe(1)
  })
})

describe("pinNumbers", () => {
  it("numbers per page by creation order, not by panel order", () => {
    const threads = buildThreads([
      comment({ id: "second", created_at: "2026-08-04T11:00:00.000Z" }),
      comment({ id: "first", created_at: "2026-08-04T10:00:00.000Z" }),
      comment({
        id: "other-page",
        page_section_id: "pg002_sec001",
        created_at: "2026-08-04T12:00:00.000Z",
      }),
    ])
    const numbers = pinNumbers(threads)
    expect(numbers.get("first")).toBe(1)
    expect(numbers.get("second")).toBe(2)
    expect(numbers.get("other-page")).toBe(1)
  })
})

describe("snippet", () => {
  it("collapses whitespace and leaves short bodies alone", () => {
    expect(snippet("one\n\ntwo")).toBe("one two")
  })

  it("cuts on a word boundary with an ellipsis", () => {
    const result = snippet("alpha bravo charlie delta echo foxtrot", 20)
    expect(result.endsWith("…")).toBe(true)
    expect(result.length).toBeLessThanOrEqual(21)
  })
})

describe("relativeAge", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z")

  it("buckets recent times", () => {
    expect(relativeAge("2026-08-04T11:59:30.000Z", now)).toEqual({ unit: "now" })
    expect(relativeAge("2026-08-04T11:30:00.000Z", now)).toEqual({ unit: "minutes", value: 30 })
    expect(relativeAge("2026-08-04T09:00:00.000Z", now)).toEqual({ unit: "hours", value: 3 })
    expect(relativeAge("2026-08-02T12:00:00.000Z", now)).toEqual({ unit: "days", value: 2 })
    expect(relativeAge("2026-07-01T12:00:00.000Z", now)?.unit).toBe("date")
  })

  it("answers null for an unparseable stamp", () => {
    expect(relativeAge("not a date", now)).toBeNull()
  })
})

describe("readableTextColor", () => {
  it("picks dark text on the light rotation colors and white on the dark ones", () => {
    expect(readableTextColor("#ffb224")).toBe("#1a1a1a")
    expect(readableTextColor("#3e63dd")).toBe("#ffffff")
  })
})

describe("firstPageWithFeedback", () => {
  it("opens on the first page that has an open thread, not on the cover", () => {
    const threads = buildThreads([comment({ id: "c1", page_section_id: "pg002_sec001" })])
    expect(firstPageWithFeedback(threads, PAGES)?.section_id).toBe("pg002_sec001")
  })

  it("falls back to a page that only has resolved feedback", () => {
    const threads = buildThreads([
      comment({
        id: "c1",
        page_section_id: "pg002_sec001",
        resolved_at: "2026-08-04T11:00:00.000Z",
      }),
    ])
    expect(firstPageWithFeedback(threads, PAGES)?.section_id).toBe("pg002_sec001")
  })

  it("falls back to the first page when there is no feedback at all", () => {
    expect(firstPageWithFeedback([], PAGES)?.section_id).toBe("pg001_sec001")
    expect(firstPageWithFeedback([], [])).toBeNull()
  })
})

describe("pinNumbers, whole-page comments", () => {
  it("skips a whole-page comment so the drawn pins stay 1, 2, 3", () => {
    const threads = buildThreads([
      comment({ id: "pin-1", created_at: "2026-08-04T10:00:00.000Z" }),
      comment({ id: "page-level", anchor: null, created_at: "2026-08-04T10:30:00.000Z" }),
      comment({ id: "pin-2", created_at: "2026-08-04T11:00:00.000Z" }),
    ])
    const numbers = pinNumbers(threads)
    expect(numbers.get("pin-1")).toBe(1)
    expect(numbers.get("pin-2")).toBe(2)
    expect(numbers.has("page-level")).toBe(false)
  })
})
