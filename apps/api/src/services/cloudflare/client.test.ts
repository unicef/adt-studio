import { describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION } from "@adt/types"
import {
  CLOUDFLARE_API_BASE_URL,
  CloudflareApiError,
  createCloudflareClient,
  fetchWorkerHealth,
  type FetchLike,
} from "./client.js"
import { createFakeCloudflare } from "./fake-cloudflare-api.js"

function clientFor(fetchFn: FetchLike) {
  return createCloudflareClient({ token: "cf-token", accountId: "acct-1", fetchFn })
}

describe("cloudflare client", () => {
  it("sends the bearer token and unwraps the result envelope", async () => {
    const seen: Array<{ url: string; auth: string | null }> = []
    const fetchFn: FetchLike = async (url, init) => {
      seen.push({ url, auth: new Headers(init?.headers).get("Authorization") })
      return new Response(
        JSON.stringify({ success: true, errors: [], result: { id: "acct-1", name: "School" } }),
        { status: 200 },
      )
    }

    const account = await clientFor(fetchFn).getAccount()

    expect(account).toEqual({ id: "acct-1", name: "School" })
    expect(seen[0].url).toBe(`${CLOUDFLARE_API_BASE_URL}/accounts/acct-1`)
    expect(seen[0].auth).toBe("Bearer cf-token")
  })

  it("throws CloudflareApiError carrying the API error codes", async () => {
    const fetchFn: FetchLike = async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 9109, message: "Unauthorized to access requested resource" }],
        }),
        { status: 403 },
      )

    const error = await clientFor(fetchFn)
      .listD1Databases()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CloudflareApiError)
    const apiError = error as CloudflareApiError
    expect(apiError.status).toBe(403)
    expect(apiError.isAuthFailure).toBe(true)
    expect(apiError.hasCode(9109)).toBe(true)
    expect(apiError.message).toContain("Unauthorized")
  })

  it("treats a success:false envelope on a 200 as a failure", async () => {
    const fetchFn: FetchLike = async () =>
      new Response(JSON.stringify({ success: false, errors: [{ code: 10, message: "nope" }] }), {
        status: 200,
      })

    await expect(clientFor(fetchFn).listR2Buckets()).rejects.toBeInstanceOf(CloudflareApiError)
  })

  it("uploads the worker as multipart with a metadata part and the main module", async () => {
    const fake = createFakeCloudflare()
    await clientFor(fake.fetchFn).uploadWorkerScript({
      name: "adt-publish",
      script: "export default { fetch() {} }",
      metadata: { main_module: "worker.js", compatibility_date: "2026-07-01", bindings: [] },
    })

    const uploaded = fake.state.scripts.get("adt-publish")
    expect(uploaded?.script).toBe("export default { fetch() {} }")
    expect(uploaded?.metadata).toMatchObject({ main_module: "worker.js" })
  })

  it("reports a missing workers.dev subdomain as null instead of throwing", async () => {
    const notFound = createFakeCloudflare({ subdomain: null })
    await expect(clientFor(notFound.fetchFn).getWorkersDevSubdomain()).resolves.toBeNull()

    const fetch404: FetchLike = async () =>
      new Response(JSON.stringify({ success: false, errors: [{ code: 10007, message: "n/a" }] }), {
        status: 404,
      })
    await expect(clientFor(fetch404).getWorkersDevSubdomain()).resolves.toBeNull()
  })

  it("parses D1 query results", async () => {
    const fake = createFakeCloudflare({ migrationRows: [{ name: "0001_init.sql", applied_at: "x" }] })
    const results = await clientFor(fake.fetchFn).queryD1(
      "db-uuid-1",
      "SELECT name FROM _migrations;",
    )
    expect(results[0].results).toEqual([{ name: "0001_init.sql" }])
  })

  it("reads the deployed worker version from /health", async () => {
    const fake = createFakeCloudflare()
    await expect(
      fetchWorkerHealth("https://adt-publish.teacher.workers.dev", fake.fetchFn),
    ).resolves.toEqual({ reachable: true, version: PUBLISH_WORKER_VERSION })
  })

  it("degrades to unreachable when /health cannot be fetched", async () => {
    const fetchFn: FetchLike = async () => {
      throw new TypeError("fetch failed")
    }
    await expect(
      fetchWorkerHealth("https://adt-publish.teacher.workers.dev", fetchFn),
    ).resolves.toEqual({ reachable: false, version: null })
  })
})
