import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openBookDb } from "@adt/storage"
import {
  PUBLISH_AUTHOR_NAME_HEADER,
  type BookPublicationStatus,
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
    fs.mkdirSync(contentDir, { recursive: true })
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

describe("no Cloudflare connection", () => {
  it("answers 412 publish_not_connected on every mutating route", async () => {
    const app = routes()
    const attempts: Array<[string, string, RequestInit]> = [
      ["POST", `/api/books/${LABEL}/publication`, publishRequest()],
      ["POST", `/api/books/${LABEL}/publication/versions`, publishRequest()],
      ["POST", `/api/books/${LABEL}/publication/revoke`, { method: "POST" }],
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
