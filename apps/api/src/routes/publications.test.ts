import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openBookDb } from "@adt/storage"
import {
  PUBLISH_AUTHOR_NAME_HEADER,
  type BookPublicationStatus,
  type PublicationRoomTicketResponse,
  type PublicationSummary,
  type PublicationsOverview,
  type PublishCommentListResponse,
  type PublishCommentResponse,
  type PublishProgressEvent,
} from "@adt/types"
import { createFakePublishWorker } from "../services/fake-publish-worker.js"
import {
  createConnectionStore,
  type CloudflareConnectionRecord,
} from "../services/cloudflare/connection-store.js"
import { readPublicationRecord } from "../services/publish-service.js"
import type { prepareExport } from "../services/export-service.js"
import { createPublishRoutes, type PublishRoutesDeps } from "./publications.js"

let tmpDir: string
let stateDir: string
let webAssetsDir: string

const LABEL = "raven"

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publish-routes-"))
  stateDir = path.join(tmpDir, ".publish-state")
  webAssetsDir = path.join(tmpDir, "assets-web")
  fs.mkdirSync(webAssetsDir, { recursive: true })
  createBook(LABEL)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run("INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)", [
    "metadata",
    "book",
    1,
    JSON.stringify({
      title: "Raven and the Sun",
      authors: ["Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    }),
  ])
  db.close()
}

function connect(workerUrl: string): CloudflareConnectionRecord {
  const record: CloudflareConnectionRecord = {
    account_id: "acct",
    account_name: "Test Account",
    worker_name: "adt-publish",
    worker_url: workerUrl,
    worker_version: "0.2.0",
    worker_migration_tag: "v1",
    workers_dev_subdomain: "example",
    d1_database_name: "adt-publish",
    d1_database_uuid: "uuid",
    r2_bucket_name: "adt-publish-snapshots",
    mgmt_secret: "fake-mgmt-secret",
    provisioned_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  }
  createConnectionStore(stateDir).write(record)
  return record
}

const MANIFEST = [
  { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
]

function fakeExport(): typeof prepareExport {
  return (async (label: string) => {
    const contentDir = path.join(tmpDir, label, "adt", "content")
    const assetsDir = path.join(tmpDir, label, "adt", "assets")
    fs.mkdirSync(contentDir, { recursive: true })
    fs.mkdirSync(assetsDir, { recursive: true })
    // `packageAdtWeb` always writes this; publish patches `features.comments`
    // into a copy of it, so its absence fails the package step.
    fs.writeFileSync(
      path.join(assetsDir, "config.json"),
      JSON.stringify({ languages: { available: ["en"], default: "en" }, features: {} }, null, 2),
    )
    fs.writeFileSync(path.join(tmpDir, label, "adt", "index.html"), "<h1>page one</h1>")
    fs.writeFileSync(
      path.join(tmpDir, label, "adt", "pg002_sec001.html"),
      "<h1>page two</h1>",
    )
    fs.writeFileSync(path.join(contentDir, "pages.json"), JSON.stringify(MANIFEST))
  }) as unknown as typeof prepareExport
}

function routes(overrides: Partial<PublishRoutesDeps> = {}): Hono {
  let minted = 0
  const app = new Hono()
  app.route(
    "/api",
    createPublishRoutes({
      booksDir: tmpDir,
      webAssetsDir,
      stateDir,
      prepareExportFn: fakeExport(),
      generateToken: () => {
        minted += 1
        return `Token${String(minted).padStart(2, "0")}TokenTokenTokenTokenTok`.slice(0, 32)
      },
      ...overrides,
    }),
  )
  return app
}

async function readSse(response: Response): Promise<PublishProgressEvent[]> {
  const text = await response.text()
  return text
    .split("\n\n")
    .map((chunk) => /^data: (.*)$/m.exec(chunk)?.[1])
    .filter((data): data is string => data !== undefined)
    .map((data) => JSON.parse(data) as PublishProgressEvent)
}

/** `streamSSE` resolves the response before the handler body finishes, so every setup
 *  publish has to be drained or the record is not yet on disk when the next call runs. */
async function drain(app: Hono, path: string, init: RequestInit): Promise<Response> {
  const res = await app.request(path, init)
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    await res.clone().text()
  }
  return res
}

function publishRequest(body: unknown = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

describe("GET /books/:label/publication", () => {
  it("answers 404 for a book that does not exist", async () => {
    const res = await routes().request("/api/books/no_such_book/publication")
    expect(res.status).toBe(404)
  })

  it("reports not connected when there is no Cloudflare connection", async () => {
    const res = await routes().request(`/api/books/${LABEL}/publication`)
    expect(res.status).toBe(200)
    const status = (await res.json()) as BookPublicationStatus
    expect(status).toEqual({
      connected: false,
      record: null,
      publication: null,
      url: null,
      worker_reachable: false,
      has_access_code: false,
    })
  })

  it("merges the local record with the worker's live publication", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    const published = await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    expect(published.status).toBe(200)

    const res = await app.request(`/api/books/${LABEL}/publication`)
    const status = (await res.json()) as BookPublicationStatus
    expect(status.connected).toBe(true)
    expect(status.worker_reachable).toBe(true)
    expect(status.publication?.current_version).toBe(1)
    expect(status.record?.token).toBe(status.publication?.token)
    expect(status.url).toBe(worker.shareUrl(status.record?.token as string))
  })

  it("degrades gracefully when the worker cannot be reached", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication`,
    )
    const status = (await res.json()) as BookPublicationStatus
    expect(status.connected).toBe(true)
    expect(status.worker_reachable).toBe(false)
    expect(status.publication).toBeNull()
    expect(status.record).not.toBeNull()
    expect(status.url).toBe(status.record?.base_url)
  })
})

describe("POST /books/:label/publication", () => {
  it("streams the publish progress and finishes with a share url", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)

    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication`,
      publishRequest(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")

    const events = await readSse(res)
    expect(events.filter((event) => event.type === "step").length).toBe(8)
    const complete = events.at(-1)
    expect(complete?.type).toBe("complete")
    if (complete?.type === "complete") {
      expect(complete.url).toBe(worker.shareUrl(complete.publication.token))
      expect(complete.version.page_manifest).toEqual(MANIFEST)
    }
  })

  it("accepts an expiry in the body", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication`,
      publishRequest({ expires_at: "2027-03-01T00:00:00.000Z" }),
    )
    const events = await readSse(res)
    const complete = events.at(-1)
    expect(complete?.type === "complete" && complete.publication.expires_at).toBe(
      "2027-03-01T00:00:00.000Z",
    )
  })

  it("rejects a body that is not valid against the contract", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication`,
      publishRequest({ expires_at: "next tuesday" }),
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: "invalid_request" })
  })

  it("answers 412 publish_not_connected with no Cloudflare connection", async () => {
    const res = await routes().request(`/api/books/${LABEL}/publication`, publishRequest())
    expect(res.status).toBe(412)
    await expect(res.json()).resolves.toMatchObject({ code: "publish_not_connected" })
  })

  it("answers 409 published_already for a book with an active publication", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "published_already" })
  })

  it("treats an expired publication as still active — expiry is liftable, not terminal", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await app.request(`/api/books/${LABEL}/publication`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_at: "2020-01-01T00:00:00.000Z" }),
    })

    const res = await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "published_already" })
  })

  it("publishes again with a fresh token after a revoke", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    const first = await readSse(
      await app.request(`/api/books/${LABEL}/publication`, publishRequest()),
    )
    const firstComplete = first.at(-1)
    const firstToken =
      firstComplete?.type === "complete" ? firstComplete.publication.token : "missing"

    const revoked = await app.request(`/api/books/${LABEL}/publication/revoke`, {
      method: "POST",
    })
    expect(revoked.status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).not.toBeNull()

    const second = await readSse(
      await app.request(`/api/books/${LABEL}/publication`, publishRequest()),
    )
    const secondComplete = second.at(-1)
    expect(secondComplete?.type).toBe("complete")
    if (secondComplete?.type !== "complete") return

    expect(secondComplete.publication.token).not.toBe(firstToken)
    expect(secondComplete.publication.revoked_at).toBeNull()

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.token).toBe(secondComplete.publication.token)
    expect(record?.revoked_at).toBeNull()
    expect(record?.versions).toEqual([
      { version: 1, published_at: "2026-08-03T12:00:00.000Z", page_count: 2 },
    ])

    expect(worker.state.publications.get(firstToken)?.revoked_at).not.toBeNull()
    expect(worker.state.publications.size).toBe(2)
  })
})

describe("POST /books/:label/publication/versions", () => {
  it("uploads a second version for an already published book", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await app.request(
      `/api/books/${LABEL}/publication/versions`,
      publishRequest(),
    )
    expect(res.status).toBe(200)
    const events = await readSse(res)
    const complete = events.at(-1)
    expect(complete?.type === "complete" && complete.publication.current_version).toBe(2)
    expect(readPublicationRecord(LABEL, tmpDir)?.versions.length).toBe(2)
  })

  it("answers 409 not_published when the book has never been published", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/versions`,
      publishRequest(),
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })

  it("answers 409 not_published when the only record is revoked", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })

    const res = await app.request(`/api/books/${LABEL}/publication/versions`, publishRequest())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })
})

describe("POST /books/:label/publication/revoke", () => {
  it("revokes on the worker and updates the local record", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { publication: { revoked_at: string | null } }
    expect(body.publication.revoked_at).toBe("2026-08-03T12:00:00.000Z")
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).toBe("2026-08-03T12:00:00.000Z")
  })

  it("answers 409 not_published for a book that was never published", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/revoke`,
      { method: "POST" },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })

  it("answers 502 worker_unreachable when the worker is down", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    await drain(
      routes({ fetchFn: worker.fetchFn }),
      `/api/books/${LABEL}/publication`,
      publishRequest(),
    )

    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication/revoke`,
      { method: "POST" },
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: "worker_unreachable" })
  })
})

describe("POST /books/:label/publication/resume", () => {
  it("clears the revocation on the worker and in the local record", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    const token = readPublicationRecord(LABEL, tmpDir)?.token as string
    await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })

    const res = await app.request(`/api/books/${LABEL}/publication/resume`, { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { publication: { token: string; revoked_at: string | null } }
    expect(body.publication.revoked_at).toBeNull()
    expect(body.publication.token).toBe(token)

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.revoked_at).toBeNull()
    expect(record?.token).toBe(token)
    expect(worker.state.publications.get(token)?.revoked_at).toBeNull()

    const status = (await (
      await app.request(`/api/books/${LABEL}/publication`)
    ).json()) as BookPublicationStatus
    expect(status.publication?.revoked_at).toBeNull()
  })

  it("keeps the version history and the expiry", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ expires_at: "2027-06-01T00:00:00.000Z" }),
    )
    await drain(app, `/api/books/${LABEL}/publication/versions`, publishRequest())
    await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })

    const res = await app.request(`/api/books/${LABEL}/publication/resume`, { method: "POST" })
    expect(res.status).toBe(200)
    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.versions.map((version) => version.version)).toEqual([1, 2])
    expect(record?.expires_at).toBe("2027-06-01T00:00:00.000Z")
  })

  it("answers 409 not_revoked when the link is still live", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await app.request(`/api/books/${LABEL}/publication/resume`, { method: "POST" })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_revoked" })
  })

  it("answers 409 not_published for a book that was never published", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/resume`,
      { method: "POST" },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })

  it("answers 502 worker_unreachable when the worker is down", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })

    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication/resume`,
      { method: "POST" },
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: "worker_unreachable" })
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).not.toBeNull()
  })
})

describe("PATCH /books/:label/publication", () => {
  it("sets and clears the expiry through the worker", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const set = await app.request(`/api/books/${LABEL}/publication`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_at: "2027-06-01T00:00:00.000Z" }),
    })
    expect(set.status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.expires_at).toBe("2027-06-01T00:00:00.000Z")

    const clear = await app.request(`/api/books/${LABEL}/publication`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_at: null }),
    })
    expect(clear.status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.expires_at).toBeNull()
  })

  it("rejects a non-ISO expiry", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expires_at: "soon" }),
      },
    )
    expect(res.status).toBe(400)
  })
})

describe("access codes", () => {
  const patch = (app: Hono, body: unknown): Promise<Response> =>
    app.request(`/api/books/${LABEL}/publication`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

  it("sends the code to the worker and keeps the plaintext in the book's record", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    const res = await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ access_code: "K7M4QP" }),
    )
    expect(res.status).toBe(200)

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.access_code).toBe("K7M4QP")
    expect(record?.has_access_code).toBe(true)
    expect(worker.state.accessCodes.get(record?.token as string)).toBe("K7M4QP")

    const status = (await (
      await app.request(`/api/books/${LABEL}/publication`)
    ).json()) as BookPublicationStatus
    expect(status.has_access_code).toBe(true)
    expect(status.record?.access_code).toBe("K7M4QP")
  })

  it("publishes without a code when none is asked for", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.access_code).toBeNull()
    expect(record?.has_access_code).toBe(false)
    expect(worker.state.accessCodes.size).toBe(0)
  })

  it("rotates the code and stores the new plaintext", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ access_code: "K7M4QP" }),
    )

    const rotated = await patch(app, { access_code: "R9T2WX" })
    expect(rotated.status).toBe(200)
    await expect(rotated.json()).resolves.toMatchObject({ has_access_code: true })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.access_code).toBe("R9T2WX")
    expect(worker.state.accessCodes.get(record?.token as string)).toBe("R9T2WX")
  })

  it("removes the code and forgets the plaintext with it", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ access_code: "K7M4QP" }),
    )

    const removed = await patch(app, { access_code: null })
    expect(removed.status).toBe(200)
    await expect(removed.json()).resolves.toMatchObject({ has_access_code: false })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.access_code).toBeNull()
    expect(record?.has_access_code).toBe(false)
    expect(worker.state.accessCodes.size).toBe(0)
  })

  it("adds a code to a book that was published without one", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    expect((await patch(app, { access_code: "K7M4QP" })).status).toBe(200)
    expect(readPublicationRecord(LABEL, tmpDir)?.access_code).toBe("K7M4QP")
  })

  it("keeps the code when only the expiry moves, and the expiry when only the code does", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ access_code: "K7M4QP" }),
    )

    expect((await patch(app, { expires_at: "2027-06-01T00:00:00.000Z" })).status).toBe(200)
    const dated = readPublicationRecord(LABEL, tmpDir)
    expect(dated?.expires_at).toBe("2027-06-01T00:00:00.000Z")
    expect(dated?.access_code).toBe("K7M4QP")
    expect(dated?.has_access_code).toBe(true)

    expect((await patch(app, { access_code: "R9T2WX" })).status).toBe(200)
    const recoded = readPublicationRecord(LABEL, tmpDir)
    expect(recoded?.expires_at).toBe("2027-06-01T00:00:00.000Z")
    expect(recoded?.access_code).toBe("R9T2WX")
  })

  it("keeps the code across an Update site", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ access_code: "K7M4QP" }),
    )
    await drain(app, `/api/books/${LABEL}/publication/versions`, publishRequest())

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.versions.length).toBe(2)
    expect(record?.access_code).toBe("K7M4QP")
    expect(record?.has_access_code).toBe(true)
  })

  it("refuses a code that is too short, too long or has whitespace", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    for (const access_code of ["abc", "abcdefghijklm", "a b c d"]) {
      const res = await app.request(
        `/api/books/${LABEL}/publication`,
        publishRequest({ access_code }),
      )
      expect(res.status, access_code).toBe(400)
      expect(worker.state.publications.size).toBe(0)
    }
  })

  it("rejects a PATCH that changes nothing", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    expect((await patch(app, {})).status).toBe(400)
  })
})

describe("no Cloudflare connection", () => {
  it("answers 412 publish_not_connected on every mutating route", async () => {
    const app = routes()
    const attempts: Array<[string, string, RequestInit]> = [
      ["POST", `/api/books/${LABEL}/publication`, publishRequest()],
      ["POST", `/api/books/${LABEL}/publication/versions`, publishRequest()],
      ["POST", `/api/books/${LABEL}/publication/revoke`, { method: "POST" }],
      ["POST", `/api/books/${LABEL}/publication/resume`, { method: "POST" }],
      ["POST", `/api/books/${LABEL}/publication/room-ticket`, { method: "POST" }],
      [
        "PATCH",
        `/api/books/${LABEL}/publication`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expires_at: null }),
        },
      ],
    ]

    for (const [method, path, init] of attempts) {
      const res = await app.request(path, init)
      expect(res.status, `${method} ${path}`).toBe(412)
      await expect(res.json(), `${method} ${path}`).resolves.toMatchObject({
        code: "publish_not_connected",
      })
    }
  })
})

describe("author comment proxies", () => {
  async function published(): Promise<{ app: Hono; worker: ReturnType<typeof createFakePublishWorker> }> {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    return { app, worker }
  }

  it("reads comments with the management secret and passes the query through", async () => {
    const { app, worker } = await published()

    const created = await app.request(
      `/api/books/${LABEL}/publication/comments`,
      publishRequest({
        page_section_id: "pg001_sec001",
        body: "Softened the palette in this version",
      }),
    )
    expect(created.status).toBe(200)
    const createdBody = (await created.json()) as PublishCommentResponse
    expect(createdBody.comment.author_name).toBe("Author")

    const res = await app.request(
      `/api/books/${LABEL}/publication/comments?page_section_id=pg001_sec001&include_resolved=true&version=1`,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as PublishCommentListResponse
    expect(body.comments.map((comment) => comment.body)).toEqual([
      "Softened the palette in this version",
    ])
    expect(body.session?.is_author).toBe(true)

    const listCall = worker.state.calls.find(
      (call) => call.method === "GET" && call.path.endsWith("/comments"),
    )
    expect(listCall?.search).toContain("page_section_id=pg001_sec001")
    expect(listCall?.search).toContain("include_resolved=true")
    expect(listCall?.search).toContain("version=1")
    expect(worker.state.bearerTokens).toContain("fake-mgmt-secret")
  })

  it("resolves a comment and forwards an author display name when the caller sends one", async () => {
    const { app, worker } = await published()
    const created = await app.request(
      `/api/books/${LABEL}/publication/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", [PUBLISH_AUTHOR_NAME_HEADER]: "Eliezir" },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "Author reply" }),
      },
    )
    const comment = ((await created.json()) as PublishCommentResponse).comment
    expect(comment.author_name).toBe("Eliezir")
    expect(worker.state.authorNames).toContain("Eliezir")

    const resolved = await app.request(
      `/api/books/${LABEL}/publication/comments/${comment.id}/resolve`,
      publishRequest({ resolved: true }),
    )
    expect(resolved.status).toBe(200)
    const resolvedBody = (await resolved.json()) as PublishCommentResponse
    expect(resolvedBody.comment.resolved_at).not.toBeNull()

    const unresolved = await app.request(
      `/api/books/${LABEL}/publication/comments/${comment.id}/resolve`,
      publishRequest({ resolved: false }),
    )
    expect(((await unresolved.json()) as PublishCommentResponse).comment.resolved_at).toBeNull()
  })

  it("keeps the management secret out of the responses", async () => {
    const { app } = await published()
    const res = await app.request(`/api/books/${LABEL}/publication/comments`)
    expect(await res.text()).not.toContain("fake-mgmt-secret")
  })

  it("passes the worker's own error envelope back on a rejected write", async () => {
    const { app } = await published()
    const res = await app.request(
      `/api/books/${LABEL}/publication/comments/nope/resolve`,
      publishRequest({ resolved: true }),
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" })
  })

  it("guards a missing book, a missing connection and a book that was never published", async () => {
    const missingBook = await routes().request(`/api/books/no_such_book/publication/comments`)
    expect(missingBook.status).toBe(404)

    const notConnected = await routes().request(`/api/books/${LABEL}/publication/comments`)
    expect(notConnected.status).toBe(412)
    await expect(notConnected.json()).resolves.toMatchObject({ code: "publish_not_connected" })

    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const notPublished = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/comments`,
    )
    expect(notPublished.status).toBe(409)
    await expect(notPublished.json()).resolves.toMatchObject({ code: "not_published" })
  })

  it("rejects a malformed body and a malformed query before calling the worker", async () => {
    const { app, worker } = await published()
    const before = worker.state.calls.length

    const badBody = await app.request(
      `/api/books/${LABEL}/publication/comments`,
      publishRequest({ page_section_id: "pg001_sec001", body: "   " }),
    )
    expect(badBody.status).toBe(400)

    const badQuery = await app.request(
      `/api/books/${LABEL}/publication/comments?version=zero`,
    )
    expect(badQuery.status).toBe(400)
    expect(worker.state.calls.length).toBe(before)
  })

  it("reports an unreachable worker as 502 worker_unreachable", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication/comments`,
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: "worker_unreachable" })
  })
})

describe("realtime room ticket proxy", () => {
  it("hands the browser a ticket and a wss address, never MGMT_SECRET", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await app.request(`/api/books/${LABEL}/publication/room-ticket`, {
      method: "POST",
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as PublicationRoomTicketResponse
    const record = readPublicationRecord(LABEL, tmpDir)
    expect(worker.state.roomTickets).toEqual([record?.token])
    expect(body.ws_url).toContain(`/p/${record?.token}/room`)
    expect(body.ws_url.startsWith("ws")).toBe(true)

    const serialized = JSON.stringify(body) + [...res.headers].flat().join(" ")
    expect(serialized).not.toContain("fake-mgmt-secret")
  })

  it("is 409 not_published for a book that was never shared", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/room-ticket`,
      { method: "POST" },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })

  it("is 404 for an unknown book", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      "/api/books/nope/publication/room-ticket",
      { method: "POST" },
    )
    expect(res.status).toBe(404)
  })

  it("reports an unreachable worker as 502 worker_unreachable", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    await drain(
      routes({ fetchFn: worker.fetchFn }),
      `/api/books/${LABEL}/publication`,
      publishRequest(),
    )

    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication/room-ticket`,
      { method: "POST" },
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: "worker_unreachable" })
  })
})

describe("author edit and delete proxies", () => {
  async function publishedWithComment(): Promise<{
    app: Hono
    worker: ReturnType<typeof createFakePublishWorker>
    id: string
  }> {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    const created = await app.request(
      `/api/books/${LABEL}/publication/comments`,
      publishRequest({ page_section_id: "pg001_sec001", body: "First pass" }),
    )
    const { comment } = (await created.json()) as PublishCommentResponse
    return { app, worker, id: comment.id }
  }

  it("edits the author's own comment and stamps edited_at", async () => {
    const { app, id } = await publishedWithComment()
    const res = await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Second pass" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as PublishCommentResponse
    expect(body.comment.body).toBe("Second pass")
    expect(body.comment.edited_at).not.toBeNull()
  })

  it("forwards the author display name on an edit and a delete", async () => {
    const { app, worker, id } = await publishedWithComment()
    await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", [PUBLISH_AUTHOR_NAME_HEADER]: "Ana" },
      body: JSON.stringify({ body: "Renamed while editing" }),
    })
    await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "DELETE",
      headers: { [PUBLISH_AUTHOR_NAME_HEADER]: "Ana" },
    })
    expect(worker.state.authorNames.filter((name) => name === "Ana").length).toBe(2)
  })

  it("soft deletes and stays idempotent", async () => {
    const { app, id } = await publishedWithComment()
    const first = await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "DELETE",
    })
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as PublishCommentResponse
    expect(firstBody.comment.deleted_at).not.toBeNull()

    const second = await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "DELETE",
    })
    expect(((await second.json()) as PublishCommentResponse).comment.deleted_at).toBe(
      firstBody.comment.deleted_at,
    )
  })

  it("rejects a PATCH that changes nothing before calling the worker", async () => {
    const { app, worker, id } = await publishedWithComment()
    const before = worker.state.calls.length
    const res = await app.request(`/api/books/${LABEL}/publication/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "   " }),
    })
    expect(res.status).toBe(400)
    expect(worker.state.calls.length).toBe(before)
  })

  it("passes the worker's 404 through for an unknown comment", async () => {
    const { app } = await publishedWithComment()
    const res = await app.request(`/api/books/${LABEL}/publication/comments/nope`, {
      method: "DELETE",
    })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" })
  })

  it("guards a missing connection and a book that was never published", async () => {
    const notConnected = await routes().request(
      `/api/books/${LABEL}/publication/comments/abc`,
      { method: "DELETE" },
    )
    expect(notConnected.status).toBe(412)

    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const notPublished = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/comments/abc`,
      { method: "DELETE" },
    )
    expect(notPublished.status).toBe(409)
    await expect(notPublished.json()).resolves.toMatchObject({ code: "not_published" })
  })
})

describe("GET /books/:label/publication/pages", () => {
  it("answers the published version's own page manifest", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const res = await app.request(`/api/books/${LABEL}/publication/pages`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      current_version: number
      pages: Array<{ section_id: string; href: string }>
    }
    expect(body.current_version).toBe(1)
    expect(body.pages.map((page) => page.section_id)).toEqual([
      "pg001_sec001",
      "pg002_sec001",
    ])
  })

  it("follows the current version after an update", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await drain(app, `/api/books/${LABEL}/publication/versions`, publishRequest())

    const body = (await (await app.request(`/api/books/${LABEL}/publication/pages`)).json()) as {
      current_version: number
    }
    expect(body.current_version).toBe(2)
  })

  it("guards a missing book, a missing connection and a book that was never published", async () => {
    expect((await routes().request(`/api/books/no_such_book/publication/pages`)).status).toBe(404)
    expect((await routes().request(`/api/books/${LABEL}/publication/pages`)).status).toBe(412)

    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const res = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/pages`,
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: "not_published" })
  })
})

describe("GET /books/:label/publication/preview/*", () => {
  async function publishedApp(): Promise<{
    app: Hono
    worker: ReturnType<typeof createFakePublishWorker>
  }> {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    return { app, worker }
  }

  it("streams the published snapshot with the worker's content type", async () => {
    const { app } = await publishedApp()
    const res = await app.request(`/api/books/${LABEL}/publication/preview/index.html`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html")
    expect(await res.text()).toBe("served index.html")
  })

  it("serves index.html for the bare preview root", async () => {
    const { app } = await publishedApp()
    const res = await app.request(`/api/books/${LABEL}/publication/preview/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("served index.html")
  })

  it("reaches the snapshot with the management secret and never leaks it", async () => {
    const { app, worker } = await publishedApp()
    const res = await app.request(`/api/books/${LABEL}/publication/preview/pg002_sec001.html`)
    expect(worker.state.bearerTokens).toContain("fake-mgmt-secret")
    const text = await res.text()
    expect(text).not.toContain("fake-mgmt-secret")
    for (const [, value] of res.headers.entries()) {
      expect(value).not.toContain("fake-mgmt-secret")
    }
  })

  it("keeps serving the snapshot after the link is revoked", async () => {
    const { app } = await publishedApp()
    await app.request(`/api/books/${LABEL}/publication/revoke`, { method: "POST" })
    const res = await app.request(`/api/books/${LABEL}/publication/preview/index.html`)
    expect(res.status).toBe(200)
  })

  it("passes an ETag through and answers 304 on a match", async () => {
    const { app } = await publishedApp()
    const first = await app.request(`/api/books/${LABEL}/publication/preview/index.html`)
    const etag = first.headers.get("etag")
    expect(etag).toBeTruthy()

    const second = await app.request(`/api/books/${LABEL}/publication/preview/index.html`, {
      headers: { "if-none-match": etag as string },
    })
    expect(second.status).toBe(304)
  })

  it("answers the worker's 404 for a file the snapshot does not have", async () => {
    const { app } = await publishedApp()
    const res = await app.request(`/api/books/${LABEL}/publication/preview/missing.html`)
    expect(res.status).toBe(404)
  })

  it("answers 404 for a book that was never published and 404 for an unknown book", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const neverPublished = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/${LABEL}/publication/preview/index.html`,
    )
    expect(neverPublished.status).toBe(404)
    await expect(neverPublished.json()).resolves.toMatchObject({ code: "not_published" })

    const unknownBook = await routes({ fetchFn: worker.fetchFn }).request(
      `/api/books/no_such_book/publication/preview/index.html`,
    )
    expect(unknownBook.status).toBe(404)
  })

  it("answers 412 with no Cloudflare connection and 502 when the worker is down", async () => {
    const notConnected = await routes().request(
      `/api/books/${LABEL}/publication/preview/index.html`,
    )
    expect(notConnected.status).toBe(412)

    const { app } = await publishedApp()
    void app
    const offline = createFakePublishWorker({ unreachable: true })
    const res = await routes({ fetchFn: offline.fetchFn }).request(
      `/api/books/${LABEL}/publication/preview/index.html`,
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: "worker_unreachable" })
  })
})

describe("GET /publications — the account's whole shelf", () => {
  async function shelf(app: Hono): Promise<PublicationsOverview> {
    const res = await app.request("/api/publications")
    expect(res.status).toBe(200)
    return (await res.json()) as PublicationsOverview
  }

  function rowFor(overview: PublicationsOverview, label: string): PublicationSummary {
    const found = overview.publications.find((summary) => summary.book_label === label)
    expect(found).toBeDefined()
    return found as PublicationSummary
  }

  it("answers 412 with no Cloudflare connection", async () => {
    const res = await routes().request("/api/publications")
    expect(res.status).toBe(412)
    await expect(res.json()).resolves.toMatchObject({ code: "publish_not_connected" })
  })

  it("answers an empty shelf with zeroed totals for a connected account", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    expect(await shelf(routes({ fetchFn: worker.fetchFn }))).toEqual({
      worker_reachable: true,
      publications: [],
      totals: {
        published_count: 0,
        active_count: 0,
        total_snapshot_bytes: 0,
        snapshot_bytes_complete: true,
        total_unresolved: 0,
      },
    })
  })

  it("lists every publication in the account with its share link and version count", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await drain(app, "/api/books/owl/publication", publishRequest())
    await drain(app, `/api/books/${LABEL}/publication/versions`, publishRequest())

    const overview = await shelf(app)
    expect(overview.worker_reachable).toBe(true)
    expect(overview.publications).toHaveLength(2)

    const raven = rowFor(overview, LABEL)
    expect(raven.version_count).toBe(2)
    expect(raven.current_version).toBe(2)
    expect(raven.book_exists).toBe(true)
    expect(raven.source).toBe("worker")
    expect(raven.url).toBe(worker.shareUrl(raven.token))
    expect(raven.last_published_at).not.toBeNull()
    expect(rowFor(overview, "owl").version_count).toBe(1)
    expect(overview.totals.published_count).toBe(2)
    expect(overview.totals.active_count).toBe(2)
  })

  /** The shelf is where the author goes to read a code out to a class, and only this machine
   *  can answer it — the worker keeps a PBKDF2 hash. A book that has left the computer takes
   *  its code with it, which the row has to represent as "unknown", never as "no code". */
  it("carries the plaintext access code for a local book and nothing for a lost one", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })

    await drain(app, `/api/books/${LABEL}/publication`, publishRequest({ access_code: "TURMA3B" }))
    await drain(app, "/api/books/owl/publication", publishRequest({ access_code: "OWL777" }))

    const before = await shelf(app)
    expect(rowFor(before, LABEL).access_code).toBe("TURMA3B")
    expect(rowFor(before, "owl").access_code).toBe("OWL777")

    fs.rmSync(path.join(tmpDir, "owl"), { recursive: true, force: true })

    const after = await shelf(app)
    const orphan = rowFor(after, "owl")
    expect(orphan.has_access_code).toBe(true)
    expect(orphan.access_code).toBeNull()
  })

  it("leaves the code null for a link anyone can open", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const row = rowFor(await shelf(app), LABEL)
    expect(row.has_access_code).toBe(false)
    expect(row.access_code).toBeNull()
  })

  it("counts a stopped link as published but not active", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await drain(app, "/api/books/owl/publication", publishRequest())
    expect(
      (await app.request("/api/books/owl/publication/revoke", { method: "POST" })).status,
    ).toBe(200)

    const overview = await shelf(app)
    expect(rowFor(overview, "owl").revoked_at).not.toBeNull()
    expect(overview.totals.published_count).toBe(2)
    expect(overview.totals.active_count).toBe(1)
  })

  it("counts an expired link as published but not active", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(
      app,
      `/api/books/${LABEL}/publication`,
      publishRequest({ expires_at: "2020-01-01T00:00:00.000Z" }),
    )

    const overview = await shelf(app)
    expect(rowFor(overview, LABEL).expires_at).toBe("2020-01-01T00:00:00.000Z")
    expect(overview.totals.published_count).toBe(1)
    expect(overview.totals.active_count).toBe(0)
  })

  it("reports the book's current title, not the one frozen at publish time", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const db = openBookDb(path.join(tmpDir, LABEL, `${LABEL}.db`))
    db.run("INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)", [
      "metadata",
      "book",
      2,
      JSON.stringify({
        title: "Raven and the Sun, second edition",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "renamed",
      }),
    ])
    db.close()

    expect(rowFor(await shelf(app), LABEL).title).toBe("Raven and the Sun, second edition")
  })

  it("still lists a publication whose book directory is gone, and says so", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    fs.rmSync(path.join(tmpDir, LABEL), { recursive: true, force: true })

    const overview = await shelf(app)
    expect(overview.publications).toHaveLength(1)
    const orphan = rowFor(overview, LABEL)
    expect(orphan.book_exists).toBe(false)
    /** The worker's frozen title is all that is left to name it with. */
    expect(orphan.title).toBe("Raven and the Sun")
    expect(orphan.url).not.toBeNull()
  })

  it("sums the measured snapshot sizes and flags a total that is only a floor", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await drain(app, "/api/books/owl/publication", publishRequest())

    const complete = await shelf(app)
    expect(complete.totals.snapshot_bytes_complete).toBe(true)
    expect(complete.totals.total_snapshot_bytes).toBeGreaterThan(0)
    expect(rowFor(complete, LABEL).snapshot_bytes).toBeGreaterThan(0)

    worker.state.unmeasuredTokens.add(rowFor(complete, "owl").token)

    const partial = await shelf(app)
    expect(rowFor(partial, "owl").snapshot_bytes).toBeNull()
    expect(partial.totals.snapshot_bytes_complete).toBe(false)
    expect(partial.totals.total_snapshot_bytes).toBe(
      rowFor(complete, LABEL).snapshot_bytes as number,
    )
  })

  it("carries the worker's comment counts into the row and the totals", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    const posted = await app.request(`/api/books/${LABEL}/publication/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_section_id: "pg001_sec001", body: "the cover feels crowded" }),
    })
    expect(posted.status).toBe(200)

    const overview = await shelf(app)
    expect(rowFor(overview, LABEL).comment_count).toBe(1)
    expect(rowFor(overview, LABEL).unresolved_count).toBe(1)
    expect(overview.totals.total_unresolved).toBe(1)
  })

  it("degrades to the local records when the worker cannot be reached", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())
    await drain(app, "/api/books/owl/publication", publishRequest())

    const offline = createFakePublishWorker({ unreachable: true })
    const overview = await shelf(routes({ fetchFn: offline.fetchFn }))

    expect(overview.worker_reachable).toBe(false)
    expect(overview.publications).toHaveLength(2)
    const raven = rowFor(overview, LABEL)
    expect(raven.source).toBe("local")
    expect(raven.book_exists).toBe(true)
    expect(raven.url).toBe(readPublicationRecord(LABEL, tmpDir)?.base_url)
    /** Counts the worker owns are never guessed at from here. */
    expect(raven.comment_count).toBe(0)
    expect(raven.unresolved_count).toBe(0)
    expect(raven.snapshot_bytes).toBeNull()
    expect(overview.totals.snapshot_bytes_complete).toBe(false)
    expect(overview.totals.total_snapshot_bytes).toBe(0)
    expect(overview.totals.published_count).toBe(2)
    expect(overview.totals.active_count).toBe(2)
  })

  it("degrades the same way for a worker too old to have the list route", async () => {
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    await drain(
      routes({ fetchFn: worker.fetchFn }),
      `/api/books/${LABEL}/publication`,
      publishRequest(),
    )

    const stale = createFakePublishWorker({
      baseUrl: worker.baseUrl,
      failListStatus: 404,
      failListBody: { error: "not_found" },
    })
    const overview = await shelf(routes({ fetchFn: stale.fetchFn }))
    expect(overview.worker_reachable).toBe(false)
    expect(overview.publications).toHaveLength(1)
    expect(rowFor(overview, LABEL).source).toBe("local")
  })

  it("omits books that were never published", async () => {
    createBook("owl")
    const worker = createFakePublishWorker()
    connect(worker.baseUrl)
    const app = routes({ fetchFn: worker.fetchFn })
    await drain(app, `/api/books/${LABEL}/publication`, publishRequest())

    expect((await shelf(app)).publications.map((row) => row.book_label)).toEqual([LABEL])

    const offline = createFakePublishWorker({ unreachable: true })
    expect(
      (await shelf(routes({ fetchFn: offline.fetchFn }))).publications.map(
        (row) => row.book_label,
      ),
    ).toEqual([LABEL])
  })
})
