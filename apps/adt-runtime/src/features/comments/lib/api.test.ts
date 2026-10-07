import { afterEach, describe, expect, it, vi } from "vitest"
import { createCommentsApi } from "@/features/comments/lib/api"

function row(id: string) {
  return {
    id,
    token: "token",
    version: 1,
    page_section_id: "pg001",
    parent_id: null,
    session_id: "s1",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "Pin",
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-01T09:00:00.000Z",
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createCommentsApi list", () => {
  it("follows next_cursor until the worker has nothing more", async () => {
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url)
        const cursor = new URL(url, "https://book.example").searchParams.get("cursor")
        const page =
          cursor === null
            ? { comments: [row("a")], session: null, next_cursor: "page-2" }
            : { comments: [row("b")], session: null, next_cursor: null }
        return new Response(JSON.stringify(page), { headers: { "content-type": "application/json" } })
      }),
    )

    const result = await createCommentsApi("/p/token/").list("pg001", { includeResolved: true })
    expect(result.comments.map((comment) => comment.id)).toEqual(["a", "b"])
    expect(urls).toEqual([
      "/p/token/comments?page_section_id=pg001&include_resolved=true",
      "/p/token/comments?page_section_id=pg001&include_resolved=true&cursor=page-2",
    ])
  })

  it("reads a worker that answers everything at once as one page", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ comments: [row("a")], session: null }), {
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchFn)

    const result = await createCommentsApi("/p/token/").listAll()
    expect(result.comments).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("stops on a cursor it has already followed", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ comments: [row("a")], session: null, next_cursor: "again" }), {
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchFn)

    await createCommentsApi("/p/token/").listAll()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
