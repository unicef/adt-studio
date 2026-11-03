import { describe, expect, it } from "vitest"
import type { PublishComment } from "@adt/types"
import { excerpt, newReaderComments } from "./new-comment-alerts"

const comment = (id: string, author: string, extra: Partial<PublishComment> = {}): PublishComment => ({
  id,
  token: "tok_aaaaaaaaaaaaaaaaaaaaaaaa",
  version: 1,
  page_section_id: "pg011_sec001",
  parent_id: null,
  session_id: `s-${author}`,
  author_name: author,
  author_color: "#aa3300",
  body: "Esta parte precisa melhorar",
  anchor: null,
  resolved_at: null,
  edited_at: null,
  deleted_at: null,
  created_at: "2026-09-25T12:00:00.000Z",
  ...extra,
})

describe("newReaderComments", () => {
  it("returns only unseen comments from readers", () => {
    const seen = new Set(["c1"])
    const fresh = newReaderComments(
      [comment("c1", "Breno"), comment("c2", "Ana"), comment("c3", "Author"), comment("c4", "Ana", { deleted_at: "2026-09-25T12:01:00.000Z" })],
      seen,
      "Author",
    )
    expect(fresh.map((c) => c.id)).toEqual(["c2"])
  })
})

describe("excerpt", () => {
  it("collapses whitespace and shortens long bodies", () => {
    expect(excerpt("  a\n\n b ")).toBe("a b")
    expect(excerpt("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`)
  })
})
