import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openBookDb } from "@adt/storage"
import { PUBLISH_WORKER_VERSION, type PublishProgressEvent } from "@adt/types"
import type { PublishRunSnapshot } from "../services/publish-run-progress.js"
import { createConnectionStore } from "../services/cloudflare/connection-store.js"
import type { CloudflareConnectionRecord } from "../services/cloudflare/connection-store.js"
import {
  createFakePublishWorker,
  type FakePublishWorker,
} from "../services/fake-publish-worker.js"
import { readPublicationRecord, savePublicationRecord } from "../services/publish-service.js"
import { createPublishWorkerClient } from "../services/publish-worker-client.js"
import type { PublishWorkerClient } from "../services/publish-worker-client.js"
import { createPublishRoutes } from "./publications.js"
import { createFakeBookHost } from "../services/cloudflare/fake-book-host.js"
import type { FakeCloudflareOptions } from "../services/cloudflare/fake-cloudflare-api.js"
import { bookHostAuthorSecret, bookWorkerName } from "../services/cloudflare/book-host.js"

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
    /** Answers requests the API makes to a book's own Worker, which is a different origin
     *  from the control plane now that book hosts serve the reader routes. */
    bookHostFetch?: FetchLike
    /** Passed to the fake Cloudflare account behind this book's own Worker. */
    cloudflare?: FakeCloudflareOptions
    /** Lets a test hold the first step open to catch a run mid-way. */
    prepareExportFn?: never
  } = {},
) {
  const worker = options.worker ?? createFakePublishWorker({ now: NOW })
  if (options.connected !== false) {
    createConnectionStore(stateDir).write(connectionRecord(worker))
  }
  /** Publishing deploys this book's own Worker now, so the routes need account credentials
   *  and the book-host artifact as well as the control plane's management secret. */
  const bookHost = createFakeBookHost(options.cloudflare ?? {})
  const app = createPublishRoutes({
    booksDir: tmpDir,
    webAssetsDir: path.join(tmpDir, "assets-web"),
    stateDir,
    now: () => new Date(NOW),
    generateToken: () => TOKEN,
    sleep: async () => {},
    prepareExportFn: options.prepareExportFn ?? ((async () => ({})) as never),
    bookHost: async () => bookHost.deps,
    ...(options.bookHostFetch === undefined ? {} : { fetchFn: options.bookHostFetch }),
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
  return { app, worker, cloudflare: bookHost.fake }
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

  /** A link keeps the book host it was last shared with, so the dashboard has to say which
   *  ones "Update site" would move onto this Studio's reader. */
  it("marks a link on an older book host as having an update", async () => {
    const { app } = routes()
    await publishOnce(app)

    const current = await (await app.request("/publications")).json()
    expect(current.publications[0]).toMatchObject({
      host_version: PUBLISH_WORKER_VERSION,
      host_update_available: false,
    })

    const record = readPublicationRecord(LABEL, tmpDir)!
    savePublicationRecord(LABEL, tmpDir, { ...record, host_version: null })
    const older = await (await app.request("/publications")).json()
    /** Unrecorded counts as older: it predates every host that records itself. */
    expect(older.publications[0]).toMatchObject({ host_version: null, host_update_available: true })
  })

  /**
   * The control plane holds every publication's row and none of its bytes, so the `url` it
   * reports answers `{"error":"not_found"}` — after the access gate has already accepted the
   * reader's code, which is what made it look like the book was missing rather than the link
   * wrong. Every surface that shows a link has to show the book's own host.
   */
  it("links to the book\u2019s own host, not the control plane that has none of its bytes", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    const overview = await (await app.request("/publications")).json()

    expect(overview.publications[0].url).toBe(
      `https://${bookWorkerName(TOKEN)}.teacher.workers.dev/p/${TOKEN}/`,
    )
    expect(overview.publications[0].url).not.toBe(worker.shareUrl(TOKEN))
    expect(overview.publications[0].url.startsWith(worker.baseUrl)).toBe(false)
  })

  /** A book published from another machine has no local record to read the address out of.
   *  The Worker's name is a pure function of the token and the subdomain is the account's, so
   *  the address is derived rather than guessed — `teacher` above is what the publish wrote
   *  down, `example` here is what the connection says. */
  it("derives the host for a publication whose book is not on this machine", async () => {
    const { app, worker } = routes()
    await publishOnce(app)
    fs.rmSync(path.join(tmpDir, LABEL), { recursive: true, force: true })

    const overview = await (await app.request("/publications")).json()

    expect(overview.publications[0]).toMatchObject({ book_exists: false })
    expect(overview.publications[0].url).toBe(
      `https://${bookWorkerName(TOKEN)}.example.workers.dev/p/${TOKEN}/`,
    )
    expect(overview.publications[0].url).not.toBe(worker.shareUrl(TOKEN))
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

  /** An account may host ~99 live books, so a permanent delete has to give the slot back —
   *  and must not leave a public Worker serving a book nothing remembers. */
  it("removes the book\u2019s own Worker so the slot is free again", async () => {
    const { app, cloudflare } = routes()
    await publishOnce(app)
    expect(cloudflare.state.scripts.has(bookWorkerName(TOKEN))).toBe(true)

    const response = await app.request(`/publications/${TOKEN}`, { method: "DELETE" })

    expect(response.status).toBe(200)
    expect(cloudflare.state.scripts.has(bookWorkerName(TOKEN))).toBe(false)
  })

  /** The Worker goes first, so a failure there leaves a book that is still recorded and still
   *  reachable rather than one that is unreachable and unfindable. */
  it("keeps the publication when its Worker cannot be removed", async () => {
    const { app, worker } = routes({ cloudflare: { workerDeleteFails: true } })
    await publishOnce(app)

    const response = await app.request(`/publications/${TOKEN}`, { method: "DELETE" })

    expect(response.status).toBe(502)
    expect(worker.state.publications.has(TOKEN)).toBe(true)
    expect(readPublicationRecord(LABEL, tmpDir)).not.toBeNull()
  })
})

/**
 * The book remembers its publication; the machine remembers the connection. Connect a
 * different Cloudflare account and they part company — the book still points at a link on the
 * old account's subdomain, which the new account has never heard of.
 *
 * That used to be a dead end with no way out: "Publish" was refused because a record existed,
 * and "Update site" asked the new worker for a version of a publication it did not have and
 * got a 404 dressed up as "Cloudflare wouldn't accept the upload… this is usually temporary".
 */
describe("a book published from a different Cloudflare account", () => {
  async function publishedElsewhere() {
    const first = routes()
    await publishOnce(first.app)
    expect(readPublicationRecord(LABEL, tmpDir)?.token).toBe(TOKEN)

    /** A second account: same Studio, same book, a worker that has never seen this token. */
    const otherWorker = createFakePublishWorker({ now: NOW, baseUrl: "https://adt-publish.other.workers.dev" })
    return routes({ worker: otherWorker })
  }

  it("reports the book as unpublished rather than offering to update a link that is gone", async () => {
    const { app } = await publishedElsewhere()

    const status = await (await app.request(`/books/${LABEL}/publication`)).json()

    expect(status.record).toBeNull()
    expect(status.url).toBeNull()
  })

  it("lets it be published again instead of refusing as already published", async () => {
    const { app, worker } = await publishedElsewhere()

    const events = await publishOnce(app)

    expect(events.at(-1)?.type).toBe("complete")
    expect(worker.state.publications.size).toBe(1)
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

    const readers = await app.request(`/publications/${TOKEN}/readers`)
    expect(readers.status).toBe(200)
    expect(await readers.json()).toEqual({ readers: [] })
    expect(overrides.listReaders).toHaveBeenCalledWith(TOKEN)

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
    /** The share link points at this book's own Worker, which is what serves the reader. */
    expect(complete).toMatchObject({
      type: "complete",
      url: expect.stringMatching(
        new RegExp(`^https://adt-book-[0-9a-f]{32}\\.teacher\\.workers\\.dev/p/${TOKEN}/$`),
      ),
    })
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

    expect(events.at(-1)).toMatchObject({
      type: "complete",
      url: expect.stringMatching(
        new RegExp(`^https://adt-book-[0-9a-f]{32}\\.teacher\\.workers\\.dev/p/${TOKEN}/$`),
      ),
    })
    expect(worker.state.versions.get(TOKEN)).toHaveLength(2)
  })

  it("refuses Update site for a book that was never published", async () => {
    const { app } = routes()
    const response = await app.request(`/books/${LABEL}/publication/versions`, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "not_published" })
  })
})

describe("a share run the browser lost", () => {
  async function runOf(app: ReturnType<typeof routes>["app"]) {
    return ((await (await app.request(`/books/${LABEL}/publication/run`)).json()) as {
      run: PublishRunSnapshot | null
    }).run
  }

  /** Holds the first step open until the test lets it go, so a run can be caught mid-way. */
  function gatedExport() {
    let open: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    return { open, prepareExportFn: (async () => { await gate; return {} }) as never }
  }

  it("keeps the ending of a run for a page that reconnects after it", async () => {
    const { app } = routes()
    expect(await runOf(app)).toBeNull()

    await publishOnce(app)

    const run = await runOf(app)
    expect(run).toMatchObject({ kind: "publish", status: "done", active_step: null, failure: null })
    expect(run?.step_states).toEqual(["done", "done", "done", "done"])
    expect(run?.result?.url).toMatch(new RegExp(`/p/${TOKEN}/$`))
  })

  it("keeps how a failed run failed", async () => {
    const { app } = routes()
    fs.rmSync(path.join(tmpDir, LABEL, "adt", "content", "pages.json"))

    await publishOnce(app)

    expect(await runOf(app)).toMatchObject({
      status: "error",
      failure: { code: "package_failed" },
    })
  })

  /** The whole reason the snapshot exists: a reload drops the stream, and the share must not
   *  drop with it. */
  it("finishes the share after the page that started it has gone", async () => {
    const { app, worker } = routes()
    const controller = new AbortController()

    const response = await app.request(`/books/${LABEL}/publication`, {
      method: "POST",
      signal: controller.signal,
    })
    controller.abort()
    void response.body?.cancel().catch(() => {})

    await vi.waitFor(async () => expect((await runOf(app))?.status).toBe("done"))
    expect(worker.state.publications.has(TOKEN)).toBe(true)
  })

  it("lists a run that is still going, and stops it before the link is made", async () => {
    const gate = gatedExport()
    const { app, worker } = routes({ prepareExportFn: gate.prepareExportFn })

    const streamed = app.request(`/books/${LABEL}/publication`, { method: "POST" }).then(drain)
    await vi.waitFor(async () => expect((await runOf(app))?.status).toBe("running"))

    const listed = (await (await app.request("/publication-runs")).json()) as {
      runs: { label: string }[]
    }
    expect(listed.runs.map((entry) => entry.label)).toEqual([LABEL])

    const cancel = await app.request(`/books/${LABEL}/publication/run/cancel`, { method: "POST" })
    expect(await cancel.json()).toEqual({ cancelled: true })
    gate.open()

    const events = await streamed
    /** Stopping is the author's choice, not a failure, so it ends the stream without one. */
    expect(events.some((event) => event.type === "error")).toBe(false)
    expect(events.some((event) => event.type === "complete")).toBe(false)
    expect(await runOf(app)).toMatchObject({ status: "cancelled" })
    expect(worker.state.publications.has(TOKEN)).toBe(false)

    const after = await app.request(`/books/${LABEL}/publication`, { method: "POST" })
    expect(after.status).toBe(200)
    await drain(after)
  })

  it("refuses to stop a run that is not running", async () => {
    const { app } = routes()
    const cancel = await app.request(`/books/${LABEL}/publication/run/cancel`, { method: "POST" })
    expect(await cancel.json()).toEqual({ cancelled: false })
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

  /**
   * Disconnect-with-delete tears down the Worker and the database, then reconnecting the same
   * account provisions the identical `adt-publish.<subdomain>.workers.dev`. Every book's record
   * still matched that URL, so `belongsToConnection` waved it through and the book claimed to be
   * published behind a link whose Worker had been deleted.
   */
  it("stops claiming a book is published once the worker says the token is gone", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    worker.state.publications.clear()

    const status = await (await app.request(`/books/${LABEL}/publication`)).json()
    expect(status).toMatchObject({ connected: true, worker_reachable: true })
    expect(status.record).toBeNull()
    expect(status.url).toBeNull()

    /** Tombstoned, not just hidden: a record left in place makes the book unpublishable. */
    expect(readPublicationRecord(LABEL, tmpDir)).toBeNull()
  })

  /** "We could not ask" is a different answer, and must not throw the record away. */
  it("keeps the record when the worker cannot be reached at all", async () => {
    const { app } = routes()
    await publishOnce(app)

    const offline = createFakePublishWorker({ now: NOW, unreachable: true })
    const { app: offlineApp } = routes({ worker: offline })

    const status = await (await offlineApp.request(`/books/${LABEL}/publication`)).json()
    expect(status).toMatchObject({ connected: true, worker_reachable: false })
    expect(status.record).not.toBeNull()
    expect(readPublicationRecord(LABEL, tmpDir)).not.toBeNull()
  })

  /** The status route reads the publication back from the control plane, which describes the
   *  link as its own — so the answer keeps the address the publish itself recorded. */
  it("keeps the book host address the publish recorded", async () => {
    const { app, worker } = routes()
    await publishOnce(app)

    const status = await (await app.request(`/books/${LABEL}/publication`)).json()
    expect(status.url).toBe(`https://${bookWorkerName(TOKEN)}.teacher.workers.dev/p/${TOKEN}/`)
    expect(status.url).not.toBe(worker.shareUrl(TOKEN))
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
  /** The control plane no longer holds the bytes, so preview reads them from the book's own
   *  Worker — and that host only recognises the author by a secret derived for this book, never
   *  the account's own. Byte fidelity itself is covered where a real book host serves a real
   *  asset, in book-host.integration.test.ts. */
  it("reads the snapshot from the book\u2019s own host, as its author", async () => {
    const asked: Array<{ url: string; authorization: string | null }> = []
    const { app } = routes({
      bookHostFetch: async (url, init) => {
        asked.push({ url, authorization: new Headers(init?.headers).get("Authorization") })
        return new Response("<!doctype html><title>Raven</title>", { status: 200 })
      },
    })
    await publishOnce(app)

    const response = await app.request(`/books/${LABEL}/publication/preview/index.html`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("<!doctype html><title>Raven</title>")
    const request = asked.at(-1)
    expect(request?.url).toMatch(
      new RegExp(`^https://adt-book-[0-9a-f]{32}\\.teacher\\.workers\\.dev/p/${TOKEN}/index.html$`),
    )
    expect(request?.authorization).toBe(
      `Bearer ${bookHostAuthorSecret(SECRET, TOKEN)}`,
    )
    /** Never the account's own secret. */
    expect(request?.authorization).not.toContain(SECRET)
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
