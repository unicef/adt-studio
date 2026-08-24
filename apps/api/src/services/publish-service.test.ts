import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import { createBookStorage, openBookDb } from "@adt/storage"
import type { BookPublicationRecord, PublishProgressEvent } from "@adt/types"
import { prepareExport } from "./export-service.js"
import type { FetchLike } from "./cloudflare/client.js"
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
    "assets/config.json": CONFIG_JSON,
    "assets/offline-preloader.js": PRELOADER_JS,
  }
}

const CONFIG = {
  title: "Raven and the Sun",
  languages: { available: ["en"], default: "en" },
  features: { glossary: true, activities: true },
}

const CONFIG_JSON = JSON.stringify(CONFIG, null, 2)

/** Same shape `generateOfflinePreloader` emits: the parsed config inlined into an
 *  `INLINE` map, keyed `"./assets/config.json"`. */
const PRELOADER_JS = `// offline-preloader.js — auto-generated, do not edit by hand
(function () {
  var INLINE = ${JSON.stringify({
    "./assets/config.json": CONFIG,
    "./content/pages.json": MANIFEST,
  })};
  window.fetch = function () { return INLINE };
})();
`

function inlinedPreloaderConfig(source: string): { features: Record<string, unknown> } {
  const marker = '"./assets/config.json":'
  const start = source.indexOf(marker) + marker.length
  const rest = source.slice(start)
  let depth = 0
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "{") depth += 1
    if (rest[index] === "}") {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(rest.slice(0, index + 1)) as { features: Record<string, unknown> }
      }
    }
  }
  throw new Error("no inlined config in the preloader")
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

    const result = await publishBook({
      sleep: async () => {}, ...publishOptions(worker), emit, expiresAt: null })

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
      "assets/config.json",
      "assets/offline-preloader.js",
      "content/pages.json",
      "index.html",
      "pg002_sec001.html",
    ])
  })

  it("turns features.comments on inside the snapshot and leaves the local export alone", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    const { emit } = collector()
    const snapshots: Uint8Array[] = []

    await publishBook({
      sleep: async () => {},
      ...publishOptions(worker),
      createClient: () =>
        createPublishWorkerClient({
          workerUrl: worker.baseUrl,
          mgmtSecret: "fake-mgmt-secret",
          fetchFn: async (input, init) => {
            const body = init?.body
            if (body instanceof FormData) {
              const snapshot = body.get("snapshot")
              if (snapshot instanceof Blob) {
                snapshots.push(new Uint8Array(await snapshot.arrayBuffer()))
              }
            }
            return worker.fetchFn(input, init)
          },
        }),
      emit,
    })

    expect(snapshots.length).toBe(1)
    const published = unzipSync(snapshots[0]!)
    const publishedConfig = JSON.parse(
      Buffer.from(published["assets/config.json"]!).toString("utf-8"),
    ) as { features: Record<string, unknown> }
    expect(publishedConfig.features.comments).toBe(true)
    expect(publishedConfig.features.glossary).toBe(true)

    // The runtime reads the preloader's inlined copy, not the served file.
    const publishedPreloader = Buffer.from(
      published["assets/offline-preloader.js"]!,
    ).toString("utf-8")
    expect(inlinedPreloaderConfig(publishedPreloader).features.comments).toBe(true)

    const onDisk = fs.readFileSync(
      path.join(tmpDir, LABEL, "adt", "assets", "config.json"),
      "utf-8",
    )
    expect(onDisk).toBe(CONFIG_JSON)
    expect((JSON.parse(onDisk) as { features: Record<string, unknown> }).features.comments).toBe(
      undefined,
    )

    const preloaderOnDisk = fs.readFileSync(
      path.join(tmpDir, LABEL, "adt", "assets", "offline-preloader.js"),
      "utf-8",
    )
    expect(preloaderOnDisk).toBe(PRELOADER_JS)
    expect(inlinedPreloaderConfig(preloaderOnDisk).features.comments).toBe(undefined)
  })

  it("refuses to publish when the preloader no longer inlines the config it can patch", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const { emit } = collector()
    const files = { ...adtFiles(), "assets/offline-preloader.js": "var INLINE = {};" }

    await expect(publishBook({
      sleep: async () => {}, ...publishOptions(worker, files), emit })).rejects.toMatchObject({
      name: "PublishStepError",
      code: "package_failed",
    })
  })

  it("fails with package_failed when the export produced no config.json", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const { emit } = collector()
    const files = adtFiles()
    delete (files as Record<string, string>)["assets/config.json"]

    await expect(
      publishBook({
      sleep: async () => {}, ...publishOptions(worker, files), emit }),
    ).rejects.toMatchObject({ name: "PublishStepError", code: "package_failed" })
  })

  it("persists the record as a versioned node_data entity", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    const { emit } = collector()

    await publishBook({
      sleep: async () => {}, ...publishOptions(worker), emit, expiresAt: null })

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
      sleep: async () => {},
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
      sleep: async () => {},
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
      publishBook({
      sleep: async () => {}, ...publishOptions(worker), emit }),
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
      publishBook({
      sleep: async () => {}, ...publishOptions(worker), emit }),
    ).rejects.toMatchObject({ code: "snapshot_too_large", stepId: "upload" })
  })

  it("packages the export as a zip the worker can unpack", async () => {
    createBook(LABEL, "Raven")
    const worker = createFakePublishWorker()
    const captured: Uint8Array[] = []
    const { emit } = collector()

    await publishBook({
      sleep: async () => {},
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
      "assets/config.json",
      "assets/offline-preloader.js",
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
    await publishBook({
      sleep: async () => {}, ...publishOptions(worker), emit })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record).not.toBeNull()

    const updatedManifest = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]
    const result = await republishBook({
      sleep: async () => {},
      ...publishOptions(worker, adtFiles(updatedManifest, "<h1>edited</h1>")),
      emit,
      record: record as BookPublicationRecord,
    })

    expect(result.publication.current_version).toBe(2)
    expect(result.url).toBe(worker.shareUrl(TOKEN))
    /** `content_revision` is the book's own node_data high-water mark, so it is asserted as a
     *  number rather than pinned to a fixture that every new stage output would change. */
    expect(readPublicationRecord(LABEL, tmpDir)?.versions).toEqual([
      {
        version: 1,
        published_at: "2026-08-03T12:00:00.000Z",
        page_count: 2,
        content_revision: expect.any(Number),
      },
      {
        version: 2,
        published_at: "2026-08-03T12:00:00.000Z",
        page_count: 1,
        content_revision: expect.any(Number),
      },
    ])
    expect(worker.state.versions.get(TOKEN)?.at(-1)?.page_manifest).toEqual(updatedManifest)
  })
})

describe("riding out a Cloudflare hiccup", () => {
  function clientWith(worker: ReturnType<typeof createFakePublishWorker>, fetchFn: FetchLike) {
    const record = connection(worker.baseUrl)
    return () =>
      createPublishWorkerClient({
        workerUrl: record.worker_url,
        mgmtSecret: record.mgmt_secret,
        fetchFn,
      })
  }

  /** The reported symptom: a 503 on upload threw away a completed export and asked the author to
   *  start over, which they did by hand at exactly the same odds. */
  it("retries a 5xx and succeeds without the author doing anything", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    let uploads = 0
    const flaky: FetchLike = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST" && String(input).endsWith("/api/publications")) {
        uploads += 1
        if (uploads === 1) return new Response("", { status: 503 })
      }
      return worker.fetchFn(input, init)
    }

    const result = await publishBook({
      sleep: async () => {},
      ...publishOptions(worker),
      createClient: clientWith(worker, flaky),
      emit: async () => {},
      expiresAt: null,
    })

    expect(uploads).toBe(2)
    expect(result.url).toContain("/p/")
  })

  /** A payload over the cap fails identically however often it is sent, so retrying only makes
   *  the author wait longer for the same answer. */
  it("does not retry a refusal that will not change", async () => {
    createBook(LABEL, "Raven and the Sun")
    const worker = createFakePublishWorker()
    let uploads = 0
    const refusing: FetchLike = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "POST" && String(input).endsWith("/api/publications")) {
        uploads += 1
        return new Response(JSON.stringify({ error: "payload_too_large" }), {
          status: 413,
          headers: { "content-type": "application/json" },
        })
      }
      return worker.fetchFn(input, init)
    }

    await expect(
      publishBook({
        sleep: async () => {},
        ...publishOptions(worker),
        createClient: clientWith(worker, refusing),
        emit: async () => {},
        expiresAt: null,
      }),
    ).rejects.toThrow()
    expect(uploads).toBe(1)
  })
})
