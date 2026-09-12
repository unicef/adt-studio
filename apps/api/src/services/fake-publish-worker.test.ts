import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createFakePublishWorker, type FakePublishWorker } from "./fake-publish-worker.js"
import { createPublishWorkerClient, isPublishWorkerError } from "./publish-worker-client.js"

const TOKEN = "TokenRavenTokenRavenTokenRaven12"
const SECRET = "fake-mgmt-secret"
const NOW = "2026-08-03T12:00:00.000Z"

const SNAPSHOT = [
  { path: "index.html", text: "<!doctype html><title>Raven</title>" },
  { path: "assets/cover art.png", text: "cover-bytes" },
]

const MANIFEST = [{ section_id: "s1", href: "index.html", page_number: 1 }]

function declare(files: { path: string; text: string }[]) {
  return files.map((file) => ({
    path: file.path,
    bytes: Buffer.byteLength(file.text),
    sha256: createHash("sha256").update(file.text).digest("hex"),
  }))
}

function bytesOf(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text))
}

function clientFor(worker: FakePublishWorker, mgmtSecret: string) {
  return createPublishWorkerClient({
    workerUrl: worker.baseUrl,
    mgmtSecret,
    fetchFn: worker.fetchFn,
  })
}

function harness(options: Parameters<typeof createFakePublishWorker>[0] = {}) {
  const worker = createFakePublishWorker({ now: NOW, ...options })
  return {
    worker,
    client: clientFor(worker, options.mgmtSecret ?? SECRET),
    reader: clientFor(worker, "readers-hold-no-secret"),
  }
}

type Client = ReturnType<typeof createPublishWorkerClient>

function startRequest(files: { path: string; text: string }[], kind: "create" | "version") {
  return kind === "create"
    ? ({
        kind: "create" as const,
        token: TOKEN,
        title: "Raven",
        book_label: "raven",
        page_manifest: MANIFEST,
        files: declare(files),
      })
    : ({
        kind: "version" as const,
        token: TOKEN,
        page_manifest: MANIFEST,
        files: declare(files),
      })
}

async function publish(client: Client, files = SNAPSHOT, kind: "create" | "version" = "create") {
  const started = await client.startUpload(startRequest(files, kind))
  for (const file of files) {
    await client.uploadFile(started.upload_id, file.path, bytesOf(file.text))
  }
  return client.commitUpload(started.upload_id)
}

function statusOf(error: unknown): number | null {
  return (error as { status: number | null }).status
}

describe("publishing a snapshot through the staged upload", () => {
  it("creates the publication only once the upload is committed", async () => {
    const { worker, client } = harness()

    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))
    expect(started.version).toBe(1)
    expect(worker.state.publications.has(TOKEN)).toBe(false)

    for (const file of SNAPSHOT) {
      await client.uploadFile(started.upload_id, file.path, bytesOf(file.text))
    }
    expect(worker.state.publications.has(TOKEN)).toBe(false)

    const committed = await client.commitUpload(started.upload_id)
    expect(committed.publication.current_version).toBe(1)
    expect(committed.url).toBe(worker.shareUrl(TOKEN))
    expect(worker.state.publications.has(TOKEN)).toBe(true)
  })

  it("serves every file it was given, paths and contents intact", async () => {
    const { client } = harness()
    await publish(client)

    for (const file of SNAPSHOT) {
      const response = await client.fetchSnapshotFile(TOKEN, file.path)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(file.text)
    }
  })

  it("adds a second version without disturbing the first", async () => {
    const { worker, client } = harness()
    await publish(client)

    const next = [{ path: "index.html", text: "<!doctype html><title>Raven v2</title>" }]
    const committed = await publish(client, next, "version")

    expect(committed.publication.current_version).toBe(2)
    expect(worker.state.versions.get(TOKEN)).toHaveLength(2)

    const response = await client.fetchSnapshotFile(TOKEN, "index.html")
    expect(await response.text()).toBe(next[0]?.text)
  })

  it("refuses a second create for a token that is already published", async () => {
    const { client } = harness()
    await publish(client)

    const error = await publish(client).catch((caught: unknown) => caught)
    expect(isPublishWorkerError(error)).toBe(true)
    expect(statusOf(error)).toBe(409)
  })

  it("refuses a new version for a token that was never published", async () => {
    const { client } = harness()
    const error = await client
      .startUpload(startRequest(SNAPSHOT, "version"))
      .catch((caught: unknown) => caught)
    expect(statusOf(error)).toBe(404)
  })
})

describe("what the upload refuses", () => {
  it("rejects a declared path that would escape the snapshot", async () => {
    const { client } = harness()
    const files = declare(SNAPSHOT)
    files[0] = { ...files[0]!, path: "../escape.html" }

    const error = await client
      .startUpload({
        kind: "create",
        token: TOKEN,
        title: "Raven",
        book_label: "raven",
        page_manifest: [],
        files,
      })
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toContain("Unsafe file path")
  })

  it("rejects a manifest that points at a file the upload never declares", async () => {
    const { client } = harness()
    const error = await client
      .startUpload({
        kind: "create",
        token: TOKEN,
        title: "Raven",
        book_label: "raven",
        page_manifest: [{ section_id: "s1", href: "missing.html", page_number: 1 }],
        files: declare(SNAPSHOT),
      })
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toContain("page manifest")
  })

  it("rejects a file that was never declared", async () => {
    const { client } = harness()
    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))

    const error = await client
      .uploadFile(started.upload_id, "stowaway.html", bytesOf("nope"))
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toContain("not declared")
  })

  it("rejects a body that does not match its declared size and digest", async () => {
    const { client } = harness()
    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))

    const error = await client
      .uploadFile(started.upload_id, "index.html", bytesOf("a different file entirely"))
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toContain("declared size and digest")
  })

  it("refuses to commit while a declared file is still missing", async () => {
    const { worker, client } = harness()
    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))
    await client.uploadFile(started.upload_id, "index.html", bytesOf(SNAPSHOT[0]!.text))

    const error = await client.commitUpload(started.upload_id).catch((caught: unknown) => caught)

    expect(statusOf(error)).toBe(400)
    expect(worker.state.publications.has(TOKEN)).toBe(false)
  })

  it("drops the staged files on abort and will not commit afterwards", async () => {
    const { client } = harness()
    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))
    for (const file of SNAPSHOT) {
      await client.uploadFile(started.upload_id, file.path, bytesOf(file.text))
    }

    const aborted = await client.abortUpload(started.upload_id)
    expect(aborted.state).toBe("aborted")
    expect(aborted.objects_deleted).toBe(SNAPSHOT.length)

    const error = await client.commitUpload(started.upload_id).catch((caught: unknown) => caught)
    expect(statusOf(error)).toBe(409)
  })

  it("refuses to abort an upload that was already committed", async () => {
    const { client } = harness()
    const started = await client.startUpload(startRequest(SNAPSHOT, "create"))
    for (const file of SNAPSHOT) {
      await client.uploadFile(started.upload_id, file.path, bytesOf(file.text))
    }
    await client.commitUpload(started.upload_id)

    const error = await client.abortUpload(started.upload_id).catch((caught: unknown) => caught)
    expect(statusOf(error)).toBe(409)
  })

  it("answers 401 when the management secret is wrong", async () => {
    const { reader } = harness()
    const error = await reader.listPublications().catch((caught: unknown) => caught)
    expect(statusOf(error)).toBe(401)
    expect((error as { code: string | null }).code).toBe("unauthorized")
  })

  it("reports a worker that cannot be reached at all", async () => {
    const { client } = harness({ unreachable: true })
    const error = await client.listPublications().catch((caught: unknown) => caught)
    expect(isPublishWorkerError(error)).toBe(true)
    expect((error as { unreachable: boolean }).unreachable).toBe(true)
  })
})

describe("managing a publication after it is live", () => {
  it("closes a revoked link to readers while the author can still read it", async () => {
    const { client, reader } = harness()
    await publish(client)

    expect((await reader.fetchSnapshotFile(TOKEN, "index.html")).status).toBe(200)

    await client.revoke(TOKEN)
    expect((await reader.fetchSnapshotFile(TOKEN, "index.html")).status).toBe(410)
    expect((await client.fetchSnapshotFile(TOKEN, "index.html")).status).toBe(200)

    await client.reinstate(TOKEN)
    expect((await reader.fetchSnapshotFile(TOKEN, "index.html")).status).toBe(200)
  })

  it("closes an expired link to readers without revoking it", async () => {
    const { client, reader } = harness()
    await publish(client)
    await client.updatePublication(TOKEN, { expires_at: "2026-08-01T00:00:00.000Z" })

    expect((await reader.fetchSnapshotFile(TOKEN, "index.html")).status).toBe(410)
    expect((await client.getPublication(TOKEN)).publication.revoked_at).toBeNull()
  })

  it("sets and clears the access code without touching the expiry", async () => {
    const { client } = harness()
    await publish(client)

    const coded = await client.updatePublication(TOKEN, { access_code: "RAVEN7" })
    expect(coded.has_access_code).toBe(true)
    expect(coded.publication.expires_at).toBeNull()

    const cleared = await client.updatePublication(TOKEN, { access_code: null })
    expect(cleared.has_access_code).toBe(false)
  })

  it("reports the account list with sizes and the newest publish date", async () => {
    const { client } = harness()
    await publish(client)

    const list = await client.listPublications()
    expect(list.publications).toHaveLength(1)
    const entry = list.publications[0]!
    expect(entry.version_count).toBe(1)
    expect(entry.snapshot_bytes).toBe(
      SNAPSHOT.reduce((total, file) => total + Buffer.byteLength(file.text), 0),
    )
    expect(entry.last_published_at).toBe(NOW)
  })

  it("deletes the publication and counts the objects it removed", async () => {
    const { client } = harness()
    await publish(client)

    const deleted = await client.deletePublication(TOKEN)
    expect(deleted.deleted).toBe(true)
    expect(deleted.objects_deleted).toBe(SNAPSHOT.length)

    const error = await client.getPublication(TOKEN).catch((caught: unknown) => caught)
    expect(statusOf(error)).toBe(404)
  })

  it("treats deleting an unknown token as a success that removed nothing", async () => {
    const { client } = harness()
    const deleted = await client.deletePublication(TOKEN)
    expect(deleted.deleted).toBe(false)
    expect(deleted.objects_deleted).toBe(0)
  })
})
