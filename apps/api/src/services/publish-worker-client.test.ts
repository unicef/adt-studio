import { describe, expect, it, vi } from "vitest"
import type { FetchLike } from "./cloudflare/client.js"
import { createPublishWorkerClient, isPublishWorkerError } from "./publish-worker-client.js"

const WORKER_URL = "https://adt-publish.example.workers.dev"

const PUBLICATION = {
  token: "TokenRavenTokenRavenTokenRaven12",
  title: "Raven",
  book_label: "raven",
  current_version: 1,
  created_at: "2026-08-01T09:00:00.000Z",
  expires_at: null,
  revoked_at: null,
}

const DETAIL = () => ({
  publication: PUBLICATION,
  versions: [{ version: 1, page_manifest: [], created_at: "2026-08-01T09:00:00.000Z" }],
  url: `${WORKER_URL}/p/${PUBLICATION.token}/`,
  has_access_code: false,
})

function client(fetchFn: FetchLike) {
  return createPublishWorkerClient({
    workerUrl: WORKER_URL,
    mgmtSecret: "secret",
    fetchFn,
  })
}

function transportFailure(code: string, detail: string): Error {
  const cause = Object.assign(new Error(detail), { code })
  return Object.assign(new TypeError("fetch failed"), { cause })
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

describe("reporting why the worker could not be reached", () => {
  it("names the cause instead of repeating 'fetch failed'", async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      transportFailure("ENOTFOUND", "getaddrinfo ENOTFOUND adt-publish.example.workers.dev"),
    )

    const error = await client(fetchFn)
      .getPublication(PUBLICATION.token)
      .catch((caught: unknown) => caught)

    expect(isPublishWorkerError(error)).toBe(true)
    const message = (error as Error).message
    expect(message).toContain("ENOTFOUND")
    expect(message).toContain("getaddrinfo")
  })

  it("still says something useful when there is no cause to unwrap", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    const error = await client(fetchFn)
      .getPublication(PUBLICATION.token)
      .catch((caught: unknown) => caught)
    expect((error as Error).message).toContain("fetch failed")
  })

  it("surfaces the worker's own error code and message on a failed response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "not_found", message: "No such publication" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    )

    const error = await client(fetchFn)
      .getPublication(PUBLICATION.token)
      .catch((caught: unknown) => caught)

    expect(isPublishWorkerError(error)).toBe(true)
    expect((error as Error).message).toBe("No such publication")
    expect((error as { status: number | null }).status).toBe(404)
    expect((error as { code: string | null }).code).toBe("not_found")
  })

  it("rejects a response whose shape does not match the contract", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ publication: { token: 12 } }))
    const error = await client(fetchFn)
      .getPublication(PUBLICATION.token)
      .catch((caught: unknown) => caught)

    expect(isPublishWorkerError(error)).toBe(true)
    expect((error as Error).message).toContain("unexpected response")
  })
})

describe("retrying a request that failed in transit", () => {
  it("does not repeat a failure it cannot even name", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    await expect(client(fetchFn).getPublication(PUBLICATION.token)).rejects.toThrow()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("retries a read and succeeds when the next attempt lands", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(transportFailure("ECONNRESET", "socket hang up"))
      .mockResolvedValueOnce(ok(DETAIL()))

    const result = await client(fetchFn).getPublication(PUBLICATION.token)
    expect(result.publication.token).toBe(PUBLICATION.token)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("does not re-send a write that may already have arrived", async () => {
    const fetchFn = vi.fn().mockRejectedValue(transportFailure("ECONNRESET", "socket hang up"))

    await expect(client(fetchFn).revoke(PUBLICATION.token)).rejects.toThrow(/ECONNRESET/)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("re-sends a write that provably never left this machine", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(transportFailure("ENOTFOUND", "getaddrinfo ENOTFOUND"))
      .mockResolvedValueOnce(ok({ publication: PUBLICATION, has_access_code: false }))

    await client(fetchFn).revoke(PUBLICATION.token)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("gives up rather than retrying forever", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(transportFailure("ENOTFOUND", "getaddrinfo ENOTFOUND"))

    await expect(client(fetchFn).getPublication(PUBLICATION.token)).rejects.toThrow(/ENOTFOUND/)
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1)
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it("retries a write killed by EPIPE, which fails before anything is sent", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(transportFailure("EPIPE", "write EPIPE"))
      .mockResolvedValueOnce(ok({ publication: PUBLICATION, has_access_code: false }))

    await client(fetchFn).revoke(PUBLICATION.token)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("reports EPIPE by name when every attempt fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(transportFailure("EPIPE", "write EPIPE"))
    const error = await client(fetchFn)
      .revoke(PUBLICATION.token)
      .catch((caught: unknown) => caught)
    expect((error as Error).message).toContain("EPIPE")
  })

  it("retries a snapshot read and returns the response untouched", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(transportFailure("ECONNRESET", "socket hang up"))
      .mockResolvedValueOnce(new Response("<!doctype html>", { status: 200 }))

    const response = await client(fetchFn).fetchSnapshotFile(PUBLICATION.token, "index.html")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("<!doctype html>")
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe("staged upload requests", () => {
  it("carries the whole file on the retry, not an empty body", async () => {
    const file = new Uint8Array(2048).fill(7)
    const bodies: number[] = []
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push((init.body as Uint8Array).byteLength)
      if (bodies.length === 1) throw transportFailure("EPIPE", "write EPIPE")
      return ok({ path: "index.html", bytes: file.byteLength })
    })

    await client(fetchFn).uploadFile("upload-1", "index.html", file)

    expect(bodies).toEqual([2048, 2048])
  })

  it("escapes each path segment without reshaping the path", async () => {
    const upload = vi.fn(async (_url: string) => ok({ path: "assets//cover art.png", bytes: 1 }))

    await client(upload).uploadFile("upload 1", "assets//cover art.png", new Uint8Array(1))

    expect(upload.mock.calls[0]?.[0]).toBe(
      `${WORKER_URL}/api/publication-uploads/upload%201/files/assets//cover%20art.png`,
    )

    const read = vi.fn(async (_url: string) => new Response("ok", { status: 200 }))

    await client(read).fetchSnapshotFile(PUBLICATION.token, "/assets/cover art.png")

    expect(read.mock.calls[0]?.[0]).toBe(
      `${WORKER_URL}/p/${PUBLICATION.token}/assets/cover%20art.png`,
    )
  })

  it("authorizes every staged upload call with the management secret", async () => {
    const fetchFn = vi.fn(async () =>
      ok({ upload_id: "upload-1", token: PUBLICATION.token, version: 1 }),
    )

    const start = await client(fetchFn).startUpload({
      kind: "create",
      token: PUBLICATION.token,
      title: "Raven",
      book_label: "raven",
      page_manifest: [],
      files: [{ path: "index.html", bytes: 12, sha256: "a".repeat(64) }],
    })

    expect(start.upload_id).toBe("upload-1")
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret")
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json")
  })
})

describe("feedback requests", () => {
  it("uses the management authorization only on server-side feedback calls", async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret")
      expect((init.headers as Record<string, string>)["X-Adt-Author-Name"]).toBe("Editor")
      expect(url).toBe(`${WORKER_URL}/p/${PUBLICATION.token}/comments?include_resolved=true`)
      return ok({
        comments: [],
        session: { id: "author", name: "Editor", color: "#8d8d8d", is_author: true },
      })
    })

    const result = await client(fetchFn).listComments(
      PUBLICATION.token,
      { include_resolved: true },
      "Editor",
    )
    expect(result.comments).toEqual([])
  })

  it("encodes comment identifiers and validates reader responses", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/readers")) {
        return ok({
          readers: [
            {
              id: "reader-1",
              name: "Maria",
              color: "#e5484d",
              joined_at: "2026-08-01T09:00:00.000Z",
              comment_count: 1,
              last_comment_at: "2026-08-01T09:01:00.000Z",
            },
          ],
        })
      }
      return ok({
        comment: {
          id: "comment/1",
          token: PUBLICATION.token,
          version: 1,
          page_section_id: "pg001_sec001",
          parent_id: null,
          session_id: "author",
          author_name: "Author",
          author_color: "#8d8d8d",
          body: "Looks good",
          anchor: null,
          resolved_at: null,
          edited_at: null,
          deleted_at: null,
          created_at: "2026-08-01T09:00:00.000Z",
        },
      })
    })

    const readers = await client(fetchFn).listReaders(PUBLICATION.token)
    expect(readers.readers[0]?.name).toBe("Maria")
    await client(fetchFn).resolveComment(
      PUBLICATION.token,
      "comment/1",
      { resolved: true },
    )
    expect(fetchFn.mock.calls.at(-1)?.[0]).toBe(
      `${WORKER_URL}/p/${PUBLICATION.token}/comments/comment%2F1/resolve`,
    )
  })
})
