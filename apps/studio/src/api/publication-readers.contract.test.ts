// @vitest-environment jsdom
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createConnectionStore } from "../../../api/src/services/cloudflare/connection-store.js"
import { createPublishRoutes } from "../../../api/src/routes/publications.js"
import type { PublishWorkerClient } from "../../../api/src/services/publish-worker-client.js"
import { ApiError, BASE_URL, api } from "./client"

/**
 * The Studio client and the API used to disagree about where a publication's roster lives —
 * the client asked for `/publications/:token/readers` while the API served
 * `/books/:label/publication/readers`. Both sides were green: the Studio's own tests mock the
 * client method, and the API's tests call its route directly, so nothing ever put the two
 * halves in the same room. This test does: the real `api.getPublicationReaders` builds the URL
 * and the real route handles it. It fails if either side moves.
 */

const TOKEN = "TokenRavenTokenRavenTokenRaven12"
const NOW = "2026-08-03T12:00:00.000Z"

let tmpDir: string
let listReaders: ReturnType<typeof vi.fn>
let realFetch: typeof globalThis.fetch

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-readers-contract-"))
  const stateDir = path.join(tmpDir, ".publish-state")
  createConnectionStore(stateDir).write({
    account_id: "acct",
    account_name: "Account",
    worker_name: "adt-publish",
    worker_url: "https://worker.example",
    worker_version: "0.13.0",
    worker_migration_tag: null,
    workers_dev_subdomain: "example",
    d1_database_name: "adt-publish",
    d1_database_uuid: "uuid",
    r2_bucket_name: "adt-publish",
    mgmt_secret: "fake-mgmt-secret",
    provisioned_at: NOW,
    updated_at: NOW,
  })

  listReaders = vi.fn().mockResolvedValue({
    readers: [{ name: "Ana", color: "#8d8d8d", joined_at: NOW, comment_count: 0, last_comment_at: null }],
  })

  const app = createPublishRoutes({
    booksDir: tmpDir,
    webAssetsDir: path.join(tmpDir, "assets-web"),
    stateDir,
    now: () => new Date(NOW),
    createClient: () => ({ listReaders }) as unknown as PublishWorkerClient,
  })

  /* The routes are mounted under `/api` by the real server, so the shim strips exactly the
   * prefix the client added — a client that stopped sending it would 404 here too. */
  realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    expect(url.startsWith(`${BASE_URL}/`)).toBe(true)
    return app.request(url.slice(BASE_URL.length), init)
  }) as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("the readers roster contract", () => {
  it("serves the URL the Studio client actually asks for", async () => {
    const result = await api.getPublicationReaders(TOKEN)

    expect(result.readers).toHaveLength(1)
    expect(result.readers[0]?.name).toBe("Ana")
    expect(listReaders).toHaveBeenCalledWith(TOKEN)
  })

  it("answers a token it does not recognise as a token, not as a missing route", async () => {
    const error = await api.getPublicationReaders("not-a-token").catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe("not_published")
    expect(listReaders).not.toHaveBeenCalled()
  })
})
