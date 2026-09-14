import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openBookDb } from "@adt/storage"
import type { PublishProgressEvent } from "@adt/types"
import { createConnectionStore } from "../services/cloudflare/connection-store.js"
import type { CloudflareConnectionRecord } from "../services/cloudflare/connection-store.js"
import {
  createFakePublishWorker,
  type FakePublishWorker,
} from "../services/fake-publish-worker.js"
import { readPublicationRecord } from "../services/publish-service.js"
import { createPublishWorkerClient } from "../services/publish-worker-client.js"
import type { PublishWorkerClient } from "../services/publish-worker-client.js"
import { createPublishRoutes } from "./publications.js"

const LABEL = "raven"
const TOKEN = "TokenRavenTokenRavenTokenRaven12"
const NOW = "2026-08-03T12:00:00.000Z"
const SECRET = "fake-mgmt-secret"

let tmpDir: string
let stateDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publish-routes-"))
  stateDir = path.join(tmpDir, ".publish-state")
  createBook(LABEL, "Raven")
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const CONFIG = { features: { glossary: true }, title: "Raven" }

function createBook(label: string, title: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "adt", "content"), { recursive: true })
  fs.mkdirSync(path.join(bookDir, "adt", "assets"), { recursive: true })

  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run("INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)", [
    "metadata",
    "book",
    1,
    JSON.stringify({ title, authors: ["Author"], language_code: "en" }),
  ])
  db.close()

  const adtDir = path.join(bookDir, "adt")
  fs.writeFileSync(path.join(adtDir, "index.html"), "<!doctype html><title>Raven</title>")
  fs.writeFileSync(
    path.join(adtDir, "content", "pages.json"),
    JSON.stringify([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]),
  )
  fs.writeFileSync(
    path.join(adtDir, "assets", "config.json"),
    `${JSON.stringify(CONFIG, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(adtDir, "assets", "offline-preloader.js"),
    `const files = {"./assets/config.json":${JSON.stringify(CONFIG)}};\n`,
  )
}

function connectionRecord(worker: FakePublishWorker): CloudflareConnectionRecord {
  return {
    account_id: "acct",
    account_name: "Account",
    worker_name: "adt-publish",
    worker_url: worker.baseUrl,
    worker_version: "0.13.0",
    worker_migration_tag: null,
    workers_dev_subdomain: "example",
    d1_database_name: "adt-publish",
    d1_database_uuid: "uuid",
    r2_bucket_name: "adt-publish",
    mgmt_secret: SECRET,
    provisioned_at: NOW,
    updated_at: NOW,
  }
}

function routes(
  options: {
    connected?: boolean
    worker?: FakePublishWorker
    clientOverrides?: Partial<PublishWorkerClient>
  } = {},
) {
  const worker = options.worker ?? createFakePublishWorker({ now: NOW })
  if (options.connected !== false) {
    createConnectionStore(stateDir).write(connectionRecord(worker))
  }
  const app = createPublishRoutes({
    booksDir: tmpDir,
    webAssetsDir: path.join(tmpDir, "assets-web"),
    stateDir,
    now: () => new Date(NOW),
    generateToken: () => TOKEN,
    sleep: async () => {},
    prepareExportFn: (async () => ({})) as never,
    createClient: () =>
      Object.assign(
        createPublishWorkerClient({
          workerUrl: worker.baseUrl,
          mgmtSecret: SECRET,
          fetchFn: worker.fetchFn,
        }),
        options.clientOverrides,
      ),
  })
  return { app, worker }
}

/** `streamSSE` runs its callback independently of the promise the handler returns, so the body
 *  has to be drained to completion before the publish it drives can be asserted on. */
async function drain(response: Response): Promise<PublishProgressEvent[]> {
  const body = await response.text()
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as PublishProgressEvent)
}

async function publishOnce(app: ReturnType<typeof routes>["app"]): Promise<PublishProgressEvent[]> {
  return drain(await app.request(`/books/${LABEL}/publication`, { method: "POST" }))
}

describe("the publications dashboard", () => {
  it("asks for a connection before it will list anything", async () => {
    const { app } = routes({ connected: false })
    const response = await app.request("/publications")
    expect(response.status).toBe(412)
    expect(await response.json()).toMatchObject({ code: "publish_not_connected" })
  })

  it("lists the account's publications with their totals", async () => {
    const { app } = routes()
    await publishOnce(app)

    const overview = await (await app.request("/publications")).json()
    expect(overview.worker_reachable).toBe(true)
    expect(overview.publications).toHaveLength(1)
    expect(overview.publications[0]).toMatchObject({
      token: TOKEN,
      book_label: LABEL,
      book_exists: true,
      source: "worker",
    })
    expect(overview.totals).toMatchObject({ published_count: 1, active_count: 1 })
  })

  it("falls back to what this machine remembers when the worker is unreachable", async () => {
    const { app } = routes()
    await publishOnce(app)

    const offline = createFakePublishWorker({ now: NOW, unreachable: true })
    const { app: offlineApp } = routes({ worker: offline })

    const overview = await (await offlineApp.request("/publications")).json()
    expect(overview.worker_reachable).toBe(false)
    expect(overview.publications).toHaveLength(1)
    expect(overview.publications[0]).toMatchObject({ token: TOKEN, source: "local" })
  })

  it("deletes a publication and clears the book's local record", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    const response = await app.request(`/publications/${TOKEN}`, { method: "DELETE" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ token: TOKEN, deleted: true })
    expect(worker.state.publications.has(TOKEN)).toBe(false)
    expect(readPublicationRecord(LABEL, tmpDir)).toBeNull()
  })
})

describe("publication feedback proxy routes", () => {
  const comment = {
    id: "comment-1",
    token: TOKEN,
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
    created_at: NOW,
  }

  function feedbackOverrides() {
    return {
      listReaders: vi.fn().mockResolvedValue({ readers: [] }),
      listComments: vi.fn().mockResolvedValue({
        comments: [comment],
        session: { id: "author", name: "Author", color: "#8d8d8d", is_author: true },
      }),
      createComment: vi.fn().mockResolvedValue({ comment }),
      updateComment: vi.fn().mockResolvedValue({ comment }),
      deleteComment: vi.fn().mockResolvedValue({ comment: { ...comment, deleted_at: NOW } }),
      resolveComment: vi.fn().mockResolvedValue({ comment: { ...comment, resolved_at: NOW } }),
      roomTicket: vi.fn().mockResolvedValue({
        ticket: "v1.1893456000.nonce.tag",
        ws_url: "wss://worker.example/p/token/room",
        expires_at: "2029-12-31T00:00:00.000Z",
      }),
    } satisfies Partial<PublishWorkerClient>
  }

  it("proxies author feedback without returning the management secret", async () => {
    const overrides = feedbackOverrides()
    const { app } = routes({ clientOverrides: overrides })
    await publishOnce(app)

    const readers = await app.request(`/books/${LABEL}/publication/readers`)
    expect(readers.status).toBe(200)
    expect(await readers.json()).toEqual({ readers: [] })

    const roomTicket = await app.request(`/books/${LABEL}/publication/room-ticket`, {
      method: "POST",
    })
    expect(roomTicket.status).toBe(200)
    expect(await roomTicket.json()).toMatchObject({
      ws_url: "wss://worker.example/p/token/room",
    })
    expect(overrides.roomTicket).toHaveBeenCalledWith(TOKEN)

    const comments = await app.request(
      `/books/${LABEL}/publication/comments?include_resolved=true`,
    )
    expect(comments.status).toBe(200)
    const payload = await comments.json()
    expect(payload).toMatchObject({ comments: [{ id: "comment-1" }] })
    expect(JSON.stringify(payload)).not.toContain(SECRET)

    const resolved = await app.request(`/books/${LABEL}/publication/comments/comment-1/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    })
    expect(resolved.status).toBe(200)
    expect(overrides.resolveComment).toHaveBeenCalledWith(TOKEN, "comment-1", { resolved: true })
  })

  it("rejects feedback access when the book has no publication", async () => {
    const { app } = routes({ clientOverrides: feedbackOverrides() })
    const response = await app.request(`/books/${LABEL}/publication/comments`)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "not_published" })
  })
})

describe("publishing a book over SSE", () => {
  it("streams every step and finishes with the share link", async () => {
    const { app, worker } = routes()

    const events = await publishOnce(app)

    const complete = events.at(-1)
    expect(complete).toMatchObject({ type: "complete", url: worker.shareUrl(TOKEN) })
    expect(
      events.filter((event) => event.type === "step" && event.status === "done").length,
    ).toBe(4)
    expect(worker.state.publications.has(TOKEN)).toBe(true)
  })

  it("refuses a second publish for a book that already has a live link", async () => {
    const { app } = routes()
    await publishOnce(app)

    const response = await app.request(`/books/${LABEL}/publication`, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "published_already" })
  })

  it("asks for a connection before publishing", async () => {
    const { app } = routes({ connected: false })
    const response = await app.request(`/books/${LABEL}/publication`, { method: "POST" })
    expect(response.status).toBe(412)
    expect(await response.json()).toMatchObject({ code: "publish_not_connected" })
  })

  it("reports a failed publish as an error event rather than a broken stream", async () => {
    const { app } = routes()
    fs.rmSync(path.join(tmpDir, LABEL, "adt", "content", "pages.json"))

    const events = await publishOnce(app)

    expect(events.at(-1)).toMatchObject({ type: "error", code: "package_failed" })
  })

  it("adds a version through Update site and keeps the link", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    const events = await drain(
      await app.request(`/books/${LABEL}/publication/versions`, { method: "POST" }),
    )

    expect(events.at(-1)).toMatchObject({ type: "complete", url: worker.shareUrl(TOKEN) })
    expect(worker.state.versions.get(TOKEN)).toHaveLength(2)
  })

  it("refuses Update site for a book that was never published", async () => {
    const { app } = routes()
    const response = await app.request(`/books/${LABEL}/publication/versions`, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "not_published" })
  })
})

describe("the per-book publication status", () => {
  it("answers without a connection instead of failing", async () => {
    const { app } = routes({ connected: false })
    const status = await (await app.request(`/books/${LABEL}/publication`)).json()
    expect(status).toMatchObject({ connected: false, record: null, worker_reachable: false })
  })

  it("merges the local record with the worker's live state", async () => {
    const { app } = routes()
    await publishOnce(app)

    const status = await (await app.request(`/books/${LABEL}/publication`)).json()
    expect(status).toMatchObject({ connected: true, worker_reachable: true })
    expect(status.publication.token).toBe(TOKEN)
    expect(status.record.token).toBe(TOKEN)
  })

  it("is a 404 for a book that is not on this machine", async () => {
    const { app } = routes()
    const response = await app.request("/books/missing/publication")
    expect(response.status).toBe(404)
  })
})

describe("managing a live publication", () => {
  it("revokes the link and resumes it again", async () => {
    const { app } = routes()
    await publishOnce(app)

    const revoked = await app.request(`/books/${LABEL}/publication/revoke`, { method: "POST" })
    expect(revoked.status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).toBe(NOW)

    const resumed = await app.request(`/books/${LABEL}/publication/resume`, { method: "POST" })
    expect(resumed.status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).toBeNull()
  })

  it("refuses to resume a link that was never stopped", async () => {
    const { app } = routes()
    await publishOnce(app)

    const response = await app.request(`/books/${LABEL}/publication/resume`, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "not_revoked" })
  })

  it("sets an access code and keeps the plaintext copy on this machine only", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    const response = await app.request(`/books/${LABEL}/publication`, {
      method: "PATCH",
      body: JSON.stringify({ access_code: "RAVEN7" }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ has_access_code: true })
    expect(readPublicationRecord(LABEL, tmpDir)?.access_code).toBe("RAVEN7")
    expect(worker.state.accessCodes.get(TOKEN)).toBe("RAVEN7")
  })

  it("forgets the local code when the worker says the lock is gone", async () => {
    const { app } = routes()
    await publishOnce(app)
    await app.request(`/books/${LABEL}/publication`, {
      method: "PATCH",
      body: JSON.stringify({ access_code: "RAVEN7" }),
    })

    await app.request(`/books/${LABEL}/publication`, {
      method: "PATCH",
      body: JSON.stringify({ access_code: null }),
    })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.has_access_code).toBe(false)
    expect(record?.access_code).toBeNull()
  })

  it("lists the current version's pages", async () => {
    const { app } = routes()
    await publishOnce(app)

    const pages = await (await app.request(`/books/${LABEL}/publication/pages`)).json()
    expect(pages.current_version).toBe(1)
    expect(pages.pages).toEqual([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    ])
  })
})

describe("previewing the published snapshot", () => {
  it("serves the exact bytes that were published", async () => {
    const { app } = routes()
    await publishOnce(app)

    const response = await app.request(`/books/${LABEL}/publication/preview/index.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("<!doctype html><title>Raven</title>")
  })

  it("refuses a traversal smuggled through an encoded separator", async () => {
    const { app, worker } = routes()
    await publishOnce(app)
    const before = worker.state.calls.length

    const response = await app.request(
      `/books/${LABEL}/publication/preview/..%2F..%2Fapi%2Fpublications`,
    )

    expect(response.status).toBe(400)
    expect(worker.state.calls.length).toBe(before)
  })

  it("is a 404 for a book that has never been published", async () => {
    const { app } = routes()
    const response = await app.request(`/books/${LABEL}/publication/preview/index.html`)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "not_published" })
  })
})
