import { describe, expect, it, vi } from "vitest"
import { createPublishWorkerClient, isPublishWorkerError } from "./publish-worker-client.js"

const WORKER_URL = "https://adt-publish.example.workers.dev"

function client(fetchFn: typeof fetch | ReturnType<typeof vi.fn>) {
  return createPublishWorkerClient({
    workerUrl: WORKER_URL,
    mgmtSecret: "secret",
    fetchFn: fetchFn as never,
  })
}

/** What Node's `fetch` actually throws: three unhelpful words wrapping the real reason. */
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

const DETAIL = () => ({
  publication: PUBLICATION,
  versions: [{ version: 1, page_manifest: [], created_at: "2026-08-01T09:00:00.000Z" }],
  url: `${WORKER_URL}/p/TokenRavenTokenRavenTokenRaven12/`,
  has_access_code: false,
})

const PUBLICATION = {
  token: "TokenRavenTokenRavenTokenRaven12",
  title: "Raven",
  book_label: "raven",
  current_version: 1,
  created_at: "2026-08-01T09:00:00.000Z",
  expires_at: null,
  revoked_at: null,
}

describe("reporting why the worker could not be reached", () => {
  /** The whole reason this error was hard to act on: every distinct failure arrived looking
   *  identical, because `message` is always "fetch failed" and the reason sits in `cause`. */
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
})

describe("retrying a request that failed in transit", () => {
  it("retries a read and succeeds when the next attempt lands", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(transportFailure("ECONNRESET", "socket hang up"))
      .mockResolvedValueOnce(ok(DETAIL()))

    const result = await client(fetchFn).getPublication(PUBLICATION.token)
    expect(result.publication.token).toBe(PUBLICATION.token)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  /**
   * The important one. Publishing is not idempotent — `POST …/versions` adds a version — so a
   * reset, which leaves it unknown whether the worker did the work before the answer was lost,
   * must not be re-sent. Doing so is how an author ends up with a phantom version.
   */
  it("does not re-send a write that may already have arrived", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(transportFailure("ECONNRESET", "socket hang up"))

    await expect(
      client(fetchFn).revoke(PUBLICATION.token),
    ).rejects.toThrow(/ECONNRESET/)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  /** A name that never resolved proves nothing was ever spoken, so a write is safe to repeat. */
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
})
