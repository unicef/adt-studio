import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import {
  CLOUDFLARE_ACCOUNT_ID_HEADER,
  CLOUDFLARE_TOKEN_HEADER,
  CLOUDFLARE_WORKER_NAME,
  PUBLISH_WORKER_VERSION,
  type CloudflareVerifyResponse,
  type ProvisionProgressEvent,
} from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createCloudflareRoutes, type CloudflareRoutesDeps } from "./cloudflare.js"
import type { FetchLike } from "../services/cloudflare/client.js"
import {
  createConnectionStore,
  type CloudflareConnectionRecord,
} from "../services/cloudflare/connection-store.js"
import {
  createFakeCloudflare,
  type FakeCloudflareOptions,
} from "../services/cloudflare/fake-cloudflare-api.js"

const AUTH = {
  [CLOUDFLARE_TOKEN_HEADER]: "cf-token",
  [CLOUDFLARE_ACCOUNT_ID_HEADER]: "acct-1",
}

const record: CloudflareConnectionRecord = {
  account_id: "acct-1",
  account_name: "Test Account",
  worker_name: CLOUDFLARE_WORKER_NAME,
  worker_url: `https://${CLOUDFLARE_WORKER_NAME}.teacher.workers.dev`,
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

const MIGRATION_SQL = "CREATE TABLE IF NOT EXISTS publications (token TEXT PRIMARY KEY);"

const METADATA = {
  version: PUBLISH_WORKER_VERSION,
  main_module: "worker.js",
  compatibility_date: "2026-07-01",
  bindings: [
    { type: "d1", name: "DB" },
    { type: "r2_bucket", name: "SNAPSHOTS" },
    {
      type: "durable_object_namespace",
      name: "PUBLICATION_ROOM",
      class_name: "PublicationRoom",
    },
    { type: "secret_text", name: "MGMT_SECRET" },
  ],
  migrations: { new_tag: "v1", new_sqlite_classes: ["PublicationRoom"] },
  d1_migrations: ["0001_init.sql"],
}

function parseSSE(body: string): ProvisionProgressEvent[] {
  return body
    .split("\n\n")
    .filter((block) => block.includes("data:"))
    .map((block) => {
      const line = block.split("\n").find((entry) => entry.startsWith("data:"))
      return JSON.parse(String(line).slice("data:".length).trim()) as ProvisionProgressEvent
    })
}

describe("cloudflare routes", () => {
  let tmpDir = ""
  let stateDir = ""
  let artifactDir = ""
  let migrationsDir = ""

  function buildApp(
    fakeOptions: FakeCloudflareOptions = {},
    overrides: Partial<CloudflareRoutesDeps> = {},
  ): { app: Hono; fake: ReturnType<typeof createFakeCloudflare> } {
    const fake = createFakeCloudflare(fakeOptions)
    const app = new Hono()
    app.onError(errorHandler)
    app.route(
      "/api",
      createCloudflareRoutes({
        booksDir: tmpDir,
        projectRoot: tmpDir,
        stateDir,
        artifactDir,
        migrationsDir,
        fetchFn: fake.fetchFn,
        sleep: async () => {},
        now: () => new Date("2026-08-03T12:00:00.000Z"),
        generateSecret: () => "mgmt-secret-1",
        healthAttempts: 2,
        ...overrides,
      }),
    )
    return { app, fake }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflare-routes-"))
    stateDir = path.join(tmpDir, "state")
    artifactDir = path.join(tmpDir, "dist")
    migrationsDir = path.join(tmpDir, "migrations")
    fs.mkdirSync(artifactDir, { recursive: true })
    fs.mkdirSync(migrationsDir, { recursive: true })
    fs.writeFileSync(path.join(artifactDir, "worker.js"), "export default { fetch() {} }")
    fs.writeFileSync(path.join(artifactDir, "metadata.json"), JSON.stringify(METADATA))
    fs.writeFileSync(path.join(migrationsDir, "0001_init.sql"), MIGRATION_SQL)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("POST /cloudflare/verify", () => {
    it("requires both Cloudflare headers", async () => {
      const { app } = buildApp()

      const noToken = await app.request("/api/cloudflare/verify", { method: "POST" })
      expect(noToken.status).toBe(400)
      expect((await noToken.json()).error).toContain(CLOUDFLARE_TOKEN_HEADER)

      const noAccount = await app.request("/api/cloudflare/verify", {
        method: "POST",
        headers: { [CLOUDFLARE_TOKEN_HEADER]: "cf-token" },
      })
      expect(noAccount.status).toBe(400)
      expect((await noAccount.json()).error).toContain(CLOUDFLARE_ACCOUNT_ID_HEADER)
    })

    it("returns the account name and the workers.dev subdomain", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/verify", { method: "POST", headers: AUTH })

      expect(res.status).toBe(200)
      const body = (await res.json()) as CloudflareVerifyResponse
      expect(body).toEqual({
        ok: true,
        account_name: "Test Account",
        missing_scopes: [],
        workers_dev_subdomain: "teacher",
      })
    })

    it("lists the missing scopes and a null subdomain", async () => {
      const { app } = buildApp({ denyScopes: ["R2:Edit"], subdomain: null })
      const res = await app.request("/api/cloudflare/verify", { method: "POST", headers: AUTH })

      const body = (await res.json()) as CloudflareVerifyResponse
      expect(body.ok).toBe(false)
      expect(body.missing_scopes).toEqual(["R2:Edit"])
      expect(body.workers_dev_subdomain).toBeNull()
    })

    it("404s when the account id is unknown", async () => {
      const { app } = buildApp({ accountMissing: true })
      const res = await app.request("/api/cloudflare/verify", { method: "POST", headers: AUTH })
      expect(res.status).toBe(404)
      expect((await res.json()).error).toContain("acct-1")
    })
  })

  describe("POST /cloudflare/provision", () => {
    it("streams the eight steps and a complete event", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/provision", { method: "POST", headers: AUTH })

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/event-stream")

      const body = await res.text()
      const events = parseSSE(body)
      const done = events.filter((event) => event.type === "step" && event.status === "done")
      expect(done).toHaveLength(8)
      const last = events.at(-1)
      expect(last?.type).toBe("complete")
      if (last?.type !== "complete") throw new Error("expected a complete event")
      expect(last.connection).toMatchObject({
        connected: true,
        worker_url: `https://${CLOUDFLARE_WORKER_NAME}.teacher.workers.dev`,
        upgrade_available: false,
      })
      expect(body).not.toContain("mgmt-secret-1")
    })

    it("reads the artifact and migrations from the configured directories", async () => {
      const { app, fake } = buildApp()
      const res = await app.request("/api/cloudflare/provision", { method: "POST", headers: AUTH })
      await res.text()

      expect(fake.state.scripts.get(CLOUDFLARE_WORKER_NAME)?.script).toBe(
        "export default { fetch() {} }",
      )
      expect(fake.state.executedSql).toEqual([MIGRATION_SQL])
    })

    it("emits a taxonomy error event instead of failing the stream", async () => {
      const { app } = buildApp({ subdomain: null })
      const res = await app.request("/api/cloudflare/provision", { method: "POST", headers: AUTH })

      const events = parseSSE(await res.text())
      const last = events.at(-1)
      expect(last?.type).toBe("error")
      if (last?.type !== "error") throw new Error("expected an error event")
      expect(last.code).toBe("no_workers_subdomain")
      expect(last.step_id).toBe("enable-workers-dev")
      expect(last.resume_from_step).toBe(7)
    })

    it("reports the missing scopes on the error event", async () => {
      const { app } = buildApp({ denyScopes: ["Workers Scripts:Edit"] })
      const res = await app.request("/api/cloudflare/provision", { method: "POST", headers: AUTH })

      const events = parseSSE(await res.text())
      const last = events.at(-1)
      if (last?.type !== "error") throw new Error("expected an error event")
      expect(last.code).toBe("bad_token_scope")
      expect(last.missing_scopes).toEqual(["Workers Scripts:Edit"])
    })

    it("fails with an actionable error when the worker artifact is missing", async () => {
      fs.rmSync(path.join(artifactDir, "worker.js"))
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/provision", { method: "POST", headers: AUTH })

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain("pnpm --filter @adt/publish-service build:artifact")
      expect(body.error).toContain("PUBLISH_WORKER_ARTIFACT_DIR")
    })

    it("requires the Cloudflare headers", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/provision", { method: "POST" })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /cloudflare/connection", () => {
    it("reports a disconnected status before provisioning", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/connection")

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        connected: false,
        worker_url: null,
        worker_version: null,
        latest_version: PUBLISH_WORKER_VERSION,
        upgrade_available: false,
        resources: null,
      })
    })

    it("reports the provisioned resources and the live worker version", async () => {
      createConnectionStore(stateDir).write(record)
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/connection")

      const body = await res.json()
      expect(body).toMatchObject({
        connected: true,
        worker_url: record.worker_url,
        worker_version: PUBLISH_WORKER_VERSION,
        worker_reachable: true,
        upgrade_available: false,
      })
      expect(body.resources).toMatchObject({ d1_database_uuid: "db-uuid-1" })
      expect(JSON.stringify(body)).not.toContain("mgmt-secret-1")
    })

    it("flags an available upgrade from the deployed version", async () => {
      createConnectionStore(stateDir).write({ ...record, worker_version: "0.0.1" })
      const { app } = buildApp({ workerVersion: "0.0.1" })
      const res = await app.request("/api/cloudflare/connection")
      expect(await res.json()).toMatchObject({
        worker_version: "0.0.1",
        latest_version: PUBLISH_WORKER_VERSION,
        upgrade_available: true,
      })
    })

    it("stays usable when the worker is offline", async () => {
      createConnectionStore(stateDir).write(record)
      const { app } = buildApp({ healthUnreachable: true })
      const res = await app.request("/api/cloudflare/connection")

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ connected: true, worker_reachable: false })
    })
  })

  describe("DELETE /cloudflare/connection", () => {
    it("forgets the local record without touching Cloudflare", async () => {
      const store = createConnectionStore(stateDir)
      store.write(record)
      const { app, fake } = buildApp()

      const res = await app.request("/api/cloudflare/connection", { method: "DELETE" })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ forgotten: true, deleted_resources: false })
      expect(store.read()).toBeNull()
      expect(fake.state.calls).toEqual([])
    })

    it("is a no-op when nothing is connected", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/connection", { method: "DELETE" })
      expect(await res.json()).toMatchObject({ forgotten: false, deleted_resources: false })
    })

    it("requires the token before deleting resources", async () => {
      createConnectionStore(stateDir).write(record)
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/connection?delete_resources=1", {
        method: "DELETE",
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain(CLOUDFLARE_TOKEN_HEADER)
    })

    it("tears down the worker, database and bucket", async () => {
      const store = createConnectionStore(stateDir)
      store.write(record)
      const { app, fake } = buildApp({
        databases: [{ uuid: "db-uuid-1", name: "adt-publish" }],
        buckets: ["adt-publish-snapshots"],
        scripts: [CLOUDFLARE_WORKER_NAME],
      })

      const res = await app.request("/api/cloudflare/connection?delete_resources=1", {
        method: "DELETE",
        headers: AUTH,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ forgotten: true, deleted_resources: true })
      expect(fake.state.scripts.size).toBe(0)
      expect(fake.state.databases).toEqual([])
      expect(fake.state.buckets).toEqual([])
      expect(store.read()).toBeNull()
    })

    it("fails loudly and keeps the record on a partial teardown", async () => {
      const store = createConnectionStore(stateDir)
      store.write(record)
      const fake = createFakeCloudflare({
        databases: [{ uuid: "db-uuid-1", name: "adt-publish" }],
        buckets: ["adt-publish-snapshots"],
        scripts: [CLOUDFLARE_WORKER_NAME],
      })
      const fetchFn: FetchLike = async (url, init) => {
        if (url.includes("/r2/buckets/") && init?.method === "DELETE") {
          return new Response(
            JSON.stringify({ success: false, errors: [{ code: 10014, message: "bucket not empty" }] }),
            { status: 409 },
          )
        }
        return fake.fetchFn(url, init)
      }
      const { app } = buildApp({}, { fetchFn })

      const res = await app.request("/api/cloudflare/connection?delete_resources=1", {
        method: "DELETE",
        headers: AUTH,
      })

      expect(res.status).toBe(502)
      expect((await res.json()).error).toContain("bucket not empty")
      expect(store.read()).toEqual(record)
    })
  })
})
