import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openBookDb } from "@adt/storage"
import type { PublishProgressEvent } from "@adt/types"
import type { CloudflareConnectionRecord } from "./cloudflare/connection-store.js"
import { createFakePublishWorker, type FakePublishWorker } from "./fake-publish-worker.js"
import {
  isPublishStepError,
  publishBook,
  readPendingCommit,
  readPublicationRecord,
  reconcilePendingCommit,
  republishBook,
  restoreInterruptedPublishConfig,
  toPublishErrorEvent,
} from "./publish-service.js"
import { BookHostDeployError } from "./cloudflare/book-host-deploy.js"
import { CloudflareTimeoutError } from "./cloudflare/client.js"
import { createPublishWorkerClient } from "./publish-worker-client.js"
import { createFakeBookHost, uploadedAssetText } from "./cloudflare/fake-book-host.js"

const LABEL = "raven"
const TOKEN = "TokenRavenTokenRavenTokenRaven12"
const NOW = "2026-08-03T12:00:00.000Z"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publish-service-"))
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

  writeAdt(label)
}

function writeAdt(label: string): void {
  const adtDir = path.join(tmpDir, label, "adt")
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

function connection(worker: FakePublishWorker): CloudflareConnectionRecord {
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
    mgmt_secret: "fake-mgmt-secret",
    provisioned_at: NOW,
    updated_at: NOW,
  }
}

function harness(
  bookHostOptions: Parameters<typeof createFakeBookHost>[0] = {},
  workerOptions: Parameters<typeof createFakePublishWorker>[0] = {},
) {
  const worker = createFakePublishWorker({ now: NOW, ...workerOptions })
  const bookHost = createFakeBookHost(bookHostOptions)
  const events: PublishProgressEvent[] = []
  const options = {
    label: LABEL,
    booksDir: tmpDir,
    webAssetsDir: path.join(tmpDir, "assets-web"),
    connection: connection(worker),
    bookHost: bookHost.deps,
    emit: async (event: PublishProgressEvent) => {
      events.push(event)
    },
    prepareExportFn: (async () => ({})) as never,
    generateToken: () => TOKEN,
    sleep: async () => {},
    createClient: () =>
      createPublishWorkerClient({
        workerUrl: worker.baseUrl,
        mgmtSecret: "fake-mgmt-secret",
        fetchFn: worker.fetchFn,
      }),
  }
  return { worker, events, options, cloudflare: bookHost.fake }
}

function uploadedFiles(worker: FakePublishWorker, version: number) {
  return worker.state.versions.get(TOKEN)?.find((entry) => entry.version === version)?.files ?? []
}

describe("publishing a book", () => {
  it("uploads the snapshot, registers it, and records the link", async () => {
    const { worker, events, options, cloudflare } = harness()

    const result = await publishBook(options)

    expect(result.publication.token).toBe(TOKEN)
    expect(result.version.version).toBe(1)
    /** The reader is served by this book's own Worker, not the control plane. */
    expect(result.url).toMatch(
      new RegExp(`^https://adt-book-[0-9a-f]{32}\\.teacher\\.workers\\.dev/p/${TOKEN}/$`),
    )

    const paths = uploadedFiles(worker, 1).map((file) => file.path)
    expect(paths).toContain("index.html")
    expect(paths).toContain("assets/config.json")
    expect(paths).toContain("content/pages.json")
    /** The bytes went straight to Cloudflare, so the content is asserted where it landed. */
    const uploadId = worker.state.uploads.keys().next().value as string
    const config = uploadedAssetText(cloudflare, `/uploads/${uploadId}/assets/config.json`)
    expect(JSON.parse(config!)).toEqual({
      ...CONFIG,
      features: { ...CONFIG.features, comments: true },
    })

    const record = readPublicationRecord(LABEL, tmpDir)
    expect(record?.token).toBe(TOKEN)
    /** The record remembers this book's own host, which is what the author shares. */
    expect(record?.base_url).toBe(result.url)
    expect(record?.versions).toHaveLength(1)
    expect(record?.versions[0]?.page_count).toBe(1)

    expect(fs.readFileSync(path.join(tmpDir, LABEL, "adt", "assets", "config.json"), "utf-8")).toBe(
      `${JSON.stringify(CONFIG, null, 2)}\n`,
    )
    expect(
      fs.readFileSync(
        path.join(tmpDir, LABEL, "adt", "assets", "offline-preloader.js"),
        "utf-8",
      ),
    ).toBe(`const files = {"./assets/config.json":${JSON.stringify(CONFIG)}};\n`)

    expect(events.at(-1)).toMatchObject({ type: "complete" })
  })

  it("reports every step in order and finishes each one", async () => {
    const { events, options } = harness()
    await publishBook(options)

    const done = events
      .filter((event) => event.type === "step" && event.status === "done")
      .map((event) => (event as { id: string }).id)

    expect(done).toEqual(["export", "package", "upload", "register"])
  })

  it("carries the access code and expiry into the publication", async () => {
    const { worker, options } = harness()

    const result = await publishBook({
      ...options,
      accessCode: "RAVEN7",
      expiresAt: "2027-01-01T00:00:00.000Z",
    })

    expect(result.publication.expires_at).toBe("2027-01-01T00:00:00.000Z")
    expect(worker.state.accessCodes.get(TOKEN)).toBe("RAVEN7")
    expect(readPublicationRecord(LABEL, tmpDir)?.access_code).toBe("RAVEN7")
  })

  it("fails before staging when the preloader cannot be patched safely", async () => {
    const { options } = harness()
    fs.writeFileSync(
      path.join(tmpDir, LABEL, "adt", "assets", "offline-preloader.js"),
      "const files = {};\n",
    )

    await expect(publishBook(options)).rejects.toMatchObject({
      name: "PublishStepError",
      code: "package_failed",
    })
  })
})

describe("updating a published book", () => {
  it("adds a version and keeps the original share link", async () => {
    const { worker, options, cloudflare } = harness()
    const first = await publishBook(options)

    fs.writeFileSync(
      path.join(tmpDir, LABEL, "adt", "index.html"),
      "<!doctype html><title>Raven, revised</title>",
    )

    const second = await republishBook({ ...options, record: first.record })

    expect(second.version.version).toBe(2)
    expect(second.url).toBe(first.url)
    expect(second.record.versions.map((version) => version.version)).toEqual([1, 2])

    const uploadIds = [...worker.state.uploads.keys()]
    const served = uploadedAssetText(
      cloudflare,
      `/uploads/${uploadIds[uploadIds.length - 1]}/index.html`,
    )
    expect(served).toContain("revised")
  })

  /** A deploy replaces every file the book's Worker serves, and readers stay on the old version
   *  until the commit. An update that deployed only its own files served 404s in between — and
   *  for good if the commit never came. */
  it("keeps the version readers are on in an update's deployment", async () => {
    const { worker, options, cloudflare } = harness({ assetRememberUploads: true })
    const published = await publishBook(options)
    const [firstUpload] = [...worker.state.uploads.keys()]

    fs.writeFileSync(
      path.join(tmpDir, LABEL, "adt", "index.html"),
      "<!doctype html><title>Raven, revised</title>",
    )
    await republishBook({ ...options, record: published.record })
    const secondUpload = [...worker.state.uploads.keys()].at(-1)

    expect(worker.state.calls.some((call) => call.path === "/api/static-assets/manifest" && call.search === `?token=${TOKEN}`)).toBe(true)
    const deployed = Object.keys(cloudflare.state.staticAssetManifests.at(-1) ?? {})
    expect(deployed).toContain(`/uploads/${firstUpload}/index.html`)
    expect(deployed).toContain(`/uploads/${secondUpload}/index.html`)
    expect(uploadedAssetText(cloudflare, `/uploads/${firstUpload}/index.html`)).not.toContain("revised")
  })

  it("repeats the feature selection the first publish was made with", async () => {
    const { options } = harness()
    const first = await publishBook({ ...options, features: { readAloud: false } })
    expect(first.record.features).toEqual({ readAloud: false })

    const seen: unknown[] = []
    await republishBook({
      ...options,
      record: first.record,
      prepareExportFn: (async (
        _label: string,
        _format: string,
        _booksDir: string,
        _assets: string,
        _config: string | undefined,
        features: unknown,
      ) => {
        seen.push(features)
        return {}
      }) as never,
    })

    expect(seen).toEqual([{ readAloud: false }])
  })
})

describe("the book host version", () => {
  /** Recorded so the Studio can tell which links still run an older reader. */
  it("records the host a share deployed, and the host an update deployed", async () => {
    const { options } = harness()
    const first = await publishBook(options)
    expect(first.record.host_version).toBe(options.bookHost.artifact.metadata.version)

    const newer = {
      ...options.bookHost,
      artifact: { ...options.bookHost.artifact, metadata: { ...options.bookHost.artifact.metadata, version: "9.9.9" } },
    }
    const second = await republishBook({ ...options, bookHost: newer, record: first.record })
    expect(second.record.host_version).toBe("9.9.9")
    expect(readPublicationRecord(LABEL, tmpDir)?.host_version).toBe("9.9.9")
  })

  /** A host newer than the control plane it reads and joins could half-work against it. */
  it("refuses to deploy a host the control plane is too old for, before building anything", async () => {
    const { options, events, cloudflare } = harness()
    const needsNewer = {
      ...options.bookHost,
      artifact: {
        ...options.bookHost.artifact,
        metadata: { ...options.bookHost.artifact.metadata, min_control_plane_version: "99.0.0" },
      },
    }

    await expect(publishBook({ ...options, bookHost: needsNewer })).rejects.toSatisfy(
      (error: unknown) => isPublishStepError(error) && error.code === "worker_outdated",
    )
    expect(events).toHaveLength(0)
    expect(cloudflare.state.staticAssetManifests).toHaveLength(0)
  })

  it("lets a control plane with no recorded version through rather than guess", async () => {
    const { options } = harness()
    const unknown = { ...options.connection, worker_version: null }
    const needsNewer = {
      ...options.bookHost,
      artifact: {
        ...options.bookHost.artifact,
        metadata: { ...options.bookHost.artifact.metadata, min_control_plane_version: "99.0.0" },
      },
    }

    await expect(publishBook({ ...options, connection: unknown, bookHost: needsNewer })).resolves.toBeTruthy()
  })
})

describe("when the upload goes wrong", () => {
  it("abandons the staged upload rather than leaving it open", async () => {
    const { worker, options } = harness()
    const client = createPublishWorkerClient({
      workerUrl: worker.baseUrl,
      mgmtSecret: "fake-mgmt-secret",
      fetchFn: worker.fetchFn,
    })

    const error = await publishBook({
      ...options,
      createClient: () => ({
        ...client,
        commitUpload: () => Promise.reject(new Error("commit exploded")),
      }),
    }).catch((caught: unknown) => caught)

    expect(isPublishStepError(error)).toBe(true)
    expect([...worker.state.uploads.values()].map((upload) => upload.state)).toEqual(["aborted"])
    expect(worker.state.publications.has(TOKEN)).toBe(false)
  })

  it("fails the export step when the export itself fails", async () => {
    const { options } = harness()

    const error = await publishBook({
      ...options,
      prepareExportFn: (() => Promise.reject(new Error("no pipeline output"))) as never,
    }).catch((caught: unknown) => caught)

    expect(isPublishStepError(error)).toBe(true)
    expect((error as { code: string }).code).toBe("export_failed")
    expect((error as { stepId: string | null }).stepId).toBe("export")
  })

  it("fails the package step when the export produced no page manifest", async () => {
    const { options } = harness()
    fs.rmSync(path.join(tmpDir, LABEL, "adt", "content", "pages.json"))

    const error = await publishBook(options).catch((caught: unknown) => caught)

    expect((error as { code: string }).code).toBe("package_failed")
  })
})

/** A commit whose reply never made it back left a version live on Cloudflare that this computer
 *  had no record of — a first share's link the author never got. */
describe("a commit whose reply was lost", () => {
  it("asks again, since a commit is safe to repeat, and files the record", async () => {
    const { worker, options } = harness({}, { loseCommitReplies: 1 })
    const result = await publishBook({ ...options, accessCode: "RAVEN7" })

    expect(result.record.token).toBe(TOKEN)
    expect(readPublicationRecord(LABEL, tmpDir)?.access_code).toBe("RAVEN7")
    expect(readPendingCommit(LABEL, tmpDir)).toBeNull()
    expect([...worker.state.uploads.values()].filter((upload) => upload.state === "committed")).toHaveLength(1)
  })

  it("files the record later when the reply never came back at all", async () => {
    const { options } = harness({}, { loseCommitReplies: 99 })
    await expect(publishBook({ ...options, accessCode: "RAVEN7" })).rejects.toThrow()
    expect(readPublicationRecord(LABEL, tmpDir)).toBeNull()
    expect(readPendingCommit(LABEL, tmpDir)?.token).toBe(TOKEN)

    const recovered = await reconcilePendingCommit(LABEL, tmpDir, options.createClient())

    expect(recovered?.token).toBe(TOKEN)
    expect(recovered?.access_code).toBe("RAVEN7")
    expect(recovered?.versions.map((version) => version.version)).toEqual([1])
    expect(readPublicationRecord(LABEL, tmpDir)?.base_url).toBe(recovered?.base_url)
    expect(readPendingCommit(LABEL, tmpDir)).toBeNull()
  })

  it("adds the version an update committed to the book's history", async () => {
    const first = harness()
    const published = await publishBook(first.options)
    const lossy = harness({}, { loseCommitReplies: 99 })
    /** Same book, a control plane that already holds the first version. */
    const worker = lossy.worker
    worker.state.publications = first.worker.state.publications
    worker.state.versions = first.worker.state.versions
    worker.state.uploads = first.worker.state.uploads

    await expect(republishBook({ ...lossy.options, record: published.record })).rejects.toThrow()
    expect(readPublicationRecord(LABEL, tmpDir)?.versions.map((version) => version.version)).toEqual([1])

    const recovered = await reconcilePendingCommit(LABEL, tmpDir, lossy.options.createClient())
    expect(recovered?.versions.map((version) => version.version)).toEqual([1, 2])
    expect(recovered?.base_url).toBe(published.record.base_url)
  })

  it("settles the note of a run that never committed, and files nothing", async () => {
    const { worker, options } = harness({}, { failCommitStatus: 500 })
    await expect(publishBook(options)).rejects.toThrow()
    expect(readPendingCommit(LABEL, tmpDir)).not.toBeNull()

    expect(await reconcilePendingCommit(LABEL, tmpDir, options.createClient())).toBeNull()
    expect(readPublicationRecord(LABEL, tmpDir)).toBeNull()
    expect(readPendingCommit(LABEL, tmpDir)).toBeNull()
    expect([...worker.state.uploads.values()].every((upload) => upload.state !== "open")).toBe(true)
  })

  it("leaves the note for next time while the service can't be reached", async () => {
    const { options } = harness({}, { loseCommitReplies: 99 })
    await expect(publishBook(options)).rejects.toThrow()
    const offline = createFakePublishWorker({ now: NOW, unreachable: true })
    const client = createPublishWorkerClient({ workerUrl: offline.baseUrl, mgmtSecret: "fake-mgmt-secret", fetchFn: offline.fetchFn })

    expect(await reconcilePendingCommit(LABEL, tmpDir, client)).toBeNull()
    expect(readPendingCommit(LABEL, tmpDir)).not.toBeNull()
  })
})

describe("a first share that fails", () => {
  /** Each failed share used to leave its book's Worker behind, counting against the account's
   *  limit of live books. */
  it("removes the Worker it deployed once nothing went live", async () => {
    const { worker, options, cloudflare } = harness({}, { failCommitStatus: 500 })
    await expect(publishBook(options)).rejects.toThrow()

    expect([...worker.state.uploads.values()].every((upload) => upload.state === "aborted")).toBe(true)
    expect([...cloudflare.state.scripts.keys()].some((name) => name.startsWith("adt-book-"))).toBe(false)
  })

  it("keeps the Worker when it can't confirm nothing went live", async () => {
    const { options, cloudflare } = harness({}, { loseCommitReplies: 99 })
    await expect(publishBook(options)).rejects.toThrow()

    expect([...cloudflare.state.scripts.keys()].some((name) => name.startsWith("adt-book-"))).toBe(true)
  })
})

describe("the book's config during a share", () => {
  const configPath = () => path.join(tmpDir, LABEL, "adt", "assets", "config.json")

  it("leaves the config as it found it, with no copies behind", async () => {
    const before = fs.readFileSync(configPath(), "utf-8")
    const { options } = harness()
    await publishBook(options)

    expect(fs.readFileSync(configPath(), "utf-8")).toBe(before)
    expect(fs.existsSync(path.join(tmpDir, LABEL, ".publish-restore"))).toBe(false)
  })

  /** Quitting mid-share skipped the restore, and the next offline export shipped with comments
   *  switched on. */
  it("restores the config a share was interrupted while patching", () => {
    const before = fs.readFileSync(configPath(), "utf-8")
    const restoreDir = path.join(tmpDir, LABEL, ".publish-restore")
    fs.mkdirSync(restoreDir, { recursive: true })
    fs.writeFileSync(path.join(restoreDir, "config.json"), before)
    fs.writeFileSync(configPath(), JSON.stringify({ ...CONFIG, features: { ...CONFIG.features, comments: true } }))

    restoreInterruptedPublishConfig(path.join(tmpDir, LABEL))

    expect(fs.readFileSync(configPath(), "utf-8")).toBe(before)
    expect(fs.existsSync(restoreDir)).toBe(false)
  })
})

describe("what a failed send to Cloudflare is called", () => {
  it("names a full account, so the author deletes a book instead of retrying", () => {
    expect(toPublishErrorEvent(new BookHostDeployError("full", undefined, true))).toMatchObject({
      code: "account_book_limit",
      step_id: "upload",
    })
  })

  it("names a dropped connection as one", () => {
    expect(toPublishErrorEvent(new BookHostDeployError("deploy", new CloudflareTimeoutError(60_000)))).toMatchObject({
      code: "worker_unreachable",
      step_id: "upload",
    })
  })

  it("puts any other deploy failure on the upload step", () => {
    expect(toPublishErrorEvent(new Error("Cloudflare refused"))).toMatchObject({ code: "upload_failed", step_id: "upload" })
  })
})

