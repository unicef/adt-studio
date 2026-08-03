import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import { createBookStorage, openBookDb } from "@adt/storage"
import type { BookPublicationRecord, PublishProgressEvent } from "@adt/types"
import { prepareExport } from "./export-service.js"
import { createFakePublishWorker } from "./fake-publish-worker.js"
import {
  BOOK_PUBLICATION_ITEM_ID,
  BOOK_PUBLICATION_NODE,
  isPublishStepError,
  mintPublicationToken,
  publishBook,
  readPageManifest,
  readPublicationRecord,
  republishBook,
  savePublicationRecord,
} from "./publish-service.js"
import { createPublishWorkerClient } from "./publish-worker-client.js"
import type { CloudflareConnectionRecord } from "./cloudflare/connection-store.js"

let tmpDir: string
let webAssetsDir: string

const LABEL = "raven"
const TOKEN = "TokenTokenTokenTokenTokenToken12"

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publish-service-"))
  webAssetsDir = path.join(tmpDir, "assets-web")
  createWebAssets(webAssetsDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createWebAssets(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(dir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

function createBook(label: string, title: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run("INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)", [
    "metadata",
    "book",
    1,
    JSON.stringify({
      title,
      authors: ["Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    }),
  ])
  db.close()
}

function addPagesAndRenderings(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let index = 1; index <= count; index += 1) {
      const pageId = `pg${String(index).padStart(3, "0")}`
      storage.putExtractedPage({
        pageId,
        pageNumber: index,
        text: `Page ${index}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${index}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putNodeData("page-sectioning", pageId, {
        reasoning: "ok",
        sections: [
          {
            sectionId: `${pageId}_sec001`,
            sectionType: "content",
            nodes: [],
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: index,
            isPruned: false,
          },
        ],
      })
      storage.putNodeData("web-rendering", pageId, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<p>Rendered page ${index}</p>`,
          },
        ],
      })
    }
  } finally {
    storage.close()
  }
}

/** Stands in for `prepareExport` so the orchestration tests do not rebuild a whole book;
 *  it writes the same `adt/` shape `packageAdtWeb` produces. */
function fakeExport(files: Record<string, string>) {
  return async (label: string): Promise<void> => {
    const adtDir = path.join(tmpDir, label, "adt")
    for (const [relative, body] of Object.entries(files)) {
      const target = path.join(adtDir, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, body)
    }
  }
}

const MANIFEST = [
  { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
]

function adtFiles(manifest: unknown = MANIFEST, indexBody = "<h1>page one</h1>") {
  return {
    "index.html": indexBody,
    "pg002_sec001.html": "<h1>page two</h1>",
    "content/pages.json": JSON.stringify(manifest),
    "assets/base.bundle.min.js": "console.log(1)",
  }
}

function connection(workerUrl: string): CloudflareConnectionRecord {
  return {
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
}

function collector() {
  const events: PublishProgressEvent[] = []
  return {
    events,
    emit: async (event: PublishProgressEvent) => {
      events.push(event)
    },
  }
}

function publishOptions(worker: ReturnType<typeof createFakePublishWorker>, files = adtFiles()) {
  const record = connection(worker.baseUrl)
  return {
    label: LABEL,
    booksDir: tmpDir,
    webAssetsDir,
    connection: record,
    prepareExportFn: fakeExport(files) as unknown as typeof prepareExport,
    createClient: () =>
      createPublishWorkerClient({
        workerUrl: record.worker_url,
        mgmtSecret: record.mgmt_secret,
        fetchFn: worker.fetchFn,
      }),
    generateToken: () => TOKEN,
  }
}

describe("mintPublicationToken", () => {
  it("mints 32 url-safe characters that differ every time", () => {
    const first = mintPublicationToken()
    const second = mintPublicationToken()
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(second).not.toBe(first)
  })
})

describe("readPageManifest", () => {
  it("reads the page list the built adt bundle already ships to the runtime", async () => {
    createBook(LABEL, "Raven and the Sun")
    addPagesAndRenderings(LABEL, 2)
    await prepareExport(LABEL, "adt", tmpDir, webAssetsDir)

    const manifest = readPageManifest(path.join(tmpDir, LABEL))
    expect(manifest.length).toBe(2)
    expect(manifest[0]).toEqual({ section_id: "pg001_sec001", href: "index.html", page_number: 1 })
    expect(manifest[1]?.href).toBe("pg002_sec001.html")

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, LABEL, "adt", "content", "pages.json"), "utf-8"),
    ) as unknown
    expect(manifest).toEqual(onDisk)
  })

  it("fails with package_failed when the export produced no manifest", () => {
    createBook(LABEL, "Raven")
    fs.mkdirSync(path.join(tmpDir, LABEL, "adt"), { recursive: true })
    try {
      readPageManifest(path.join(tmpDir, LABEL))
      expect.unreachable("expected a PublishStepError")
    } catch (error) {
      expect(isPublishStepError(error)).toBe(true)
      if (isPublishStepError(error)) {
        expect(error.code).toBe("package_failed")
        expect(error.stepId).toBe("package")
      }
    }
  })

  it("rejects a manifest that does not match the contract", () => {
    createBook(LABEL, "Raven")
    const contentDir = path.join(tmpDir, LABEL, "adt", "content")
    fs.mkdirSync(contentDir, { recursive: true })
    fs.writeFileSync(path.join(contentDir, "pages.json"), JSON.stringify([{ href: "" }]))
    try {
      readPageManifest(path.join(tmpDir, LABEL))
      expect.unreachable("expected a PublishStepError")
    } catch (error) {
      expect(isPublishStepError(error) && error.code).toBe("package_failed")
    }
  })
})

describe("publishBook", () => {
  it("streams the four steps, uploads the zipped bundle and records the publication", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    const { events, emit } = collector()

    const result = await publishBook({ ...publishOptions(worker), emit, expiresAt: null })

    expect(
      events
        .filter((event) => event.type === "step")
        .map((event) => `${event.id}:${event.status}`),
    ).toEqual([
      "export:running",
      "export:done",
      "package:running",
      "package:done",
      "upload:running",
      "upload:done",
      "register:running",
      "register:done",
    ])
    const complete = events.at(-1)
    expect(complete?.type).toBe("complete")

    expect(result.url).toBe(worker.shareUrl(TOKEN))
    expect(result.publication.title).toBe("Raven and the Sun")
    expect(result.publication.book_label).toBe(LABEL)

    const uploaded = worker.state.versions.get(TOKEN)?.[0]
    expect(uploaded?.page_manifest).toEqual(MANIFEST)
    expect(uploaded?.files).toEqual([
      "assets/base.bundle.min.js",
      "content/pages.json",
      "index.html",
      "pg002_sec001.html",
    ])
  })

  it("persists the record as a versioned node_data entity", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    const { emit } = collector()

    await publishBook({ ...publishOptions(worker), emit, expiresAt: null })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record).toMatchObject({
      token: TOKEN,
      base_url: worker.shareUrl(TOKEN),
      worker_url: worker.baseUrl,
      expires_at: null,
      revoked_at: null,
      versions: [{ version: 1, page_count: 2 }],
    })

    const storage = createBookStorage(LABEL, tmpDir)
    try {
      const row = storage.getLatestNodeData(BOOK_PUBLICATION_NODE, BOOK_PUBLICATION_ITEM_ID)
      expect(row?.version).toBe(1)
    } finally {
      storage.close()
    }
  })

  it("never overwrites an earlier record — every save is a new entity version", async () => {
    createBook(LABEL, "Raven")
    const first: BookPublicationRecord = {
      token: TOKEN,
      base_url: `https://worker.example/p/${TOKEN}/`,
      worker_url: "https://worker.example",
      created_at: "2026-08-01T00:00:00.000Z",
      expires_at: null,
      revoked_at: null,
      versions: [{ version: 1, published_at: "2026-08-01T00:00:00.000Z", page_count: 2 }],
    }
    expect(savePublicationRecord(LABEL, tmpDir, first).version).toBe(1)
    expect(
      savePublicationRecord(LABEL, tmpDir, { ...first, revoked_at: "2026-08-02T00:00:00.000Z" })
        .version,
    ).toBe(2)
    expect(readPublicationRecord(LABEL, tmpDir)?.revoked_at).toBe("2026-08-02T00:00:00.000Z")
  })

  it("forwards the expiry the caller asked for", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const { emit } = collector()

    const result = await publishBook({
      ...publishOptions(worker),
      emit,
      expiresAt: "2027-01-01T00:00:00.000Z",
    })
    expect(result.publication.expires_at).toBe("2027-01-01T00:00:00.000Z")
    expect(readPublicationRecord(LABEL, tmpDir)?.expires_at).toBe("2027-01-01T00:00:00.000Z")
  })

  it("reports export_failed when the export throws", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const { emit } = collector()

    await expect(
      publishBook({
        ...publishOptions(worker),
        prepareExportFn: (async () => {
          throw new Error("pipeline is not finished")
        }) as unknown as typeof prepareExport,
        emit,
      }),
    ).rejects.toMatchObject({ code: "export_failed", stepId: "export" })
  })

  it("reports worker_unreachable when the worker cannot be reached", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker({ unreachable: true })
    const { emit } = collector()

    await expect(
      publishBook({ ...publishOptions(worker), emit }),
    ).rejects.toMatchObject({ code: "worker_unreachable", stepId: "upload" })
    expect(readPublicationRecord(LABEL, tmpDir)).toBeNull()
  })

  it("maps a worker payload_too_large onto snapshot_too_large", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker({
      failCreateStatus: 413,
      failCreateBody: { error: "payload_too_large", message: "too big" },
    })
    const { emit } = collector()

    await expect(
      publishBook({ ...publishOptions(worker), emit }),
    ).rejects.toMatchObject({ code: "snapshot_too_large", stepId: "upload" })
  })

  it("packages the export as a zip the worker can unpack", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const captured: Uint8Array[] = []
    const { emit } = collector()

    await publishBook({
      ...publishOptions(worker),
      emit,
      createClient: () => ({
        async createPublication(request, snapshot) {
          captured.push(snapshot)
          return {
            publication: {
              token: request.token,
              title: request.title,
              book_label: request.book_label,
              current_version: 1,
              created_at: "2026-08-03T12:00:00.000Z",
              expires_at: null,
              revoked_at: null,
            },
            version: {
              version: 1,
              page_manifest: request.page_manifest,
              created_at: "2026-08-03T12:00:00.000Z",
            },
            url: worker.shareUrl(request.token),
          }
        },
        createVersion: () => {
          throw new Error("not used")
        },
        revoke: () => {
          throw new Error("not used")
        },
        setExpiry: () => {
          throw new Error("not used")
        },
        getPublication: () => {
          throw new Error("not used")
        },
      }),
    })

    const files = unzipSync(captured[0] as Uint8Array)
    expect(Object.keys(files).sort()).toEqual([
      "assets/base.bundle.min.js",
      "content/pages.json",
      "index.html",
      "pg002_sec001.html",
    ])
    expect(new TextDecoder().decode(files["index.html"])).toBe("<h1>page one</h1>")
  })
})

describe("republishBook", () => {
  it("uploads a new version and appends it to the local record", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const { emit } = collector()
    await publishBook({ ...publishOptions(worker), emit })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record).not.toBeNull()

    const updatedManifest = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]
    const result = await republishBook({
      ...publishOptions(worker, adtFiles(updatedManifest, "<h1>edited</h1>")),
      emit,
      record: record as BookPublicationRecord,
    })

    expect(result.publication.current_version).toBe(2)
    expect(result.url).toBe(worker.shareUrl(TOKEN))
    expect(readPublicationRecord(LABEL, tmpDir)?.versions).toEqual([
      { version: 1, published_at: "2026-08-03T12:00:00.000Z", page_count: 2 },
      { version: 2, published_at: "2026-08-03T12:00:00.000Z", page_count: 1 },
    ])
    expect(worker.state.versions.get(TOKEN)?.at(-1)?.page_manifest).toEqual(updatedManifest)
  })
})
