import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION } from "@adt/types"
import {
  CONNECTION_FILE_NAME,
  createConnectionStore,
  resolvePublishStateDir,
  type CloudflareConnectionRecord,
} from "./connection-store.js"
import { disconnectedStatus, readConnectionStatus, toConnectionStatus } from "./status.js"
import { createFakeCloudflare } from "./fake-cloudflare-api.js"

const record: CloudflareConnectionRecord = {
  account_id: "acct-1",
  account_name: "Test Account",
  worker_name: "adt-publish",
  worker_url: "https://adt-publish.teacher.workers.dev",
  worker_version: PUBLISH_WORKER_VERSION,
  worker_migration_tag: "v1",
  workers_dev_subdomain: "teacher",
  d1_database_name: "adt-publish",
  d1_database_uuid: "db-uuid-1",
  r2_bucket_name: "adt-publish-snapshots",
  mgmt_secret: "mgmt-secret-1",
  provisioned_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:00:00.000Z",
}

describe("cloudflare connection store", () => {
  let tmpDir = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflare-connection-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.PUBLISH_STATE_DIR
  })

  it("round-trips the record through a JSON file in the state dir", () => {
    const store = createConnectionStore(path.join(tmpDir, "state"))
    expect(store.read()).toBeNull()

    store.write(record)

    expect(store.filePath).toBe(path.join(tmpDir, "state", CONNECTION_FILE_NAME))
    expect(store.read()).toEqual(record)
    expect(JSON.parse(fs.readFileSync(store.filePath, "utf-8"))).toEqual(record)
  })

  it("keeps the secret-bearing file owner-only", () => {
    const store = createConnectionStore(tmpDir)
    store.write(record)
    expect(fs.statSync(store.filePath).mode & 0o777).toBe(0o600)
  })

  it("treats a corrupt or outdated file as not connected", () => {
    const store = createConnectionStore(tmpDir)
    fs.writeFileSync(store.filePath, "{not json", "utf-8")
    expect(store.read()).toBeNull()

    fs.writeFileSync(store.filePath, JSON.stringify({ account_id: "acct-1" }), "utf-8")
    expect(store.read()).toBeNull()
  })

  it("reports whether clearing removed anything", () => {
    const store = createConnectionStore(tmpDir)
    expect(store.clear()).toBe(false)
    store.write(record)
    expect(store.clear()).toBe(true)
    expect(store.read()).toBeNull()
  })

  it("defaults the state dir next to the books dir and honours the env override", () => {
    expect(resolvePublishStateDir("/tmp/books")).toBe(path.join("/tmp/books", ".publish-state"))
    process.env.PUBLISH_STATE_DIR = "/tmp/elsewhere"
    expect(resolvePublishStateDir("/tmp/books")).toBe("/tmp/elsewhere")
  })
})

describe("connection status", () => {
  let tmpDir = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflare-status-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("reports a disconnected status when nothing is provisioned", async () => {
    const store = createConnectionStore(tmpDir)
    const status = await readConnectionStatus(store)
    expect(status).toEqual(disconnectedStatus())
    expect(status.latest_version).toBe(PUBLISH_WORKER_VERSION)
  })

  it("never exposes the management secret in the status payload", async () => {
    const store = createConnectionStore(tmpDir)
    store.write(record)
    const fake = createFakeCloudflare()
    const status = await readConnectionStatus(store, { fetchFn: fake.fetchFn })
    expect(JSON.stringify(status)).not.toContain("mgmt-secret-1")
  })

  it("reads the live worker version and flags an available upgrade", async () => {
    const store = createConnectionStore(tmpDir)
    store.write({ ...record, worker_version: "0.0.1" })
    const fake = createFakeCloudflare({ workerVersion: "0.0.1" })

    const status = await readConnectionStatus(store, { fetchFn: fake.fetchFn })

    expect(status).toMatchObject({
      connected: true,
      worker_reachable: true,
      worker_version: "0.0.1",
      latest_version: PUBLISH_WORKER_VERSION,
      upgrade_available: true,
    })
  })

  it("degrades gracefully when the worker cannot be reached", async () => {
    const store = createConnectionStore(tmpDir)
    store.write(record)
    const fake = createFakeCloudflare({ healthUnreachable: true })

    const status = await readConnectionStatus(store, { fetchFn: fake.fetchFn })

    expect(status).toMatchObject({
      connected: true,
      worker_reachable: false,
      worker_version: PUBLISH_WORKER_VERSION,
      upgrade_available: false,
    })
  })

  it("skips the health probe when asked not to touch the network", async () => {
    const store = createConnectionStore(tmpDir)
    store.write(record)
    const status = await readConnectionStatus(store, { probeWorker: false })
    expect(status.worker_reachable).toBe(false)
    expect(status.worker_version).toBe(PUBLISH_WORKER_VERSION)
  })

  it("maps a record to resources without the secret", () => {
    const status = toConnectionStatus(record, { workerVersion: null, reachable: false })
    expect(status.resources).toEqual({
      account_id: "acct-1",
      account_name: "Test Account",
      worker_name: "adt-publish",
      workers_dev_subdomain: "teacher",
      d1_database_name: "adt-publish",
      d1_database_uuid: "db-uuid-1",
      r2_bucket_name: "adt-publish-snapshots",
    })
  })
})
