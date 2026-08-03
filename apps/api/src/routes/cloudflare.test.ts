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
import {
  CLOUDFLARE_OAUTH_CLIENT_ID,
  type OAuthCallbackHandler,
  type OAuthCallbackListenerFactory,
} from "../services/cloudflare/oauth.js"

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

  interface ListenerHarness {
    factory: OAuthCallbackListenerFactory
    handle: OAuthCallbackHandler | null
  }

  function buildApp(
    fakeOptions: FakeCloudflareOptions = {},
    overrides: Partial<CloudflareRoutesDeps> = {},
  ): {
    app: Hono
    fake: ReturnType<typeof createFakeCloudflare>
    listener: ListenerHarness
  } {
    const fake = createFakeCloudflare(fakeOptions)
    const listener: ListenerHarness = {
      factory: async ({ handle }) => {
        listener.handle = handle
        return { close: async () => {} }
      },
      handle: null,
    }
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
        createOAuthListener: listener.factory,
        ...overrides,
      }),
    )
    return { app, fake, listener }
  }

  async function startOAuthFlow(app: Hono): Promise<{ state: string; authUrl: string }> {
    const res = await app.request("/api/cloudflare/oauth/start", { method: "POST" })
    const body = (await res.json()) as { auth_url: string; state: string }
    return { state: body.state, authUrl: body.auth_url }
  }

  async function completeOAuthFlow(
    app: Hono,
    listener: ListenerHarness,
  ): Promise<{ state: string }> {
    const { state } = await startOAuthFlow(app)
    await listener.handle?.(
      new URL(`http://localhost:8976/oauth/callback?code=auth-code&state=${state}`),
    )
    return { state }
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

  describe("cloudflare oauth routes", () => {
    it("starts a flow and hands back a real dash.cloudflare.com consent url", async () => {
      const { app, listener } = buildApp()
      const res = await app.request("/api/cloudflare/oauth/start", { method: "POST" })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { auth_url: string; state: string }
      const url = new URL(body.auth_url)
      expect(`${url.origin}${url.pathname}`).toBe("https://dash.cloudflare.com/oauth2/auth")
      expect(url.searchParams.get("client_id")).toBe(CLOUDFLARE_OAUTH_CLIENT_ID)
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8976/oauth/callback")
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("state")).toBe(body.state)
      expect(url.searchParams.get("scope")).toContain("offline_access")
      expect(listener.handle).not.toBeNull()
    })

    it("409s with a code when a flow is already pending", async () => {
      const { app, listener } = buildApp()
      await startOAuthFlow(app)

      const res = await app.request("/api/cloudflare/oauth/start", { method: "POST" })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "oauth_flow_pending" })
    })

    it("409s with a code when the callback port is taken", async () => {
      const { app } = buildApp(
        {},
        {
          createOAuthListener: async () => {
            const { CloudflareOAuthError } = await import("../services/cloudflare/oauth.js")
            throw new CloudflareOAuthError("oauth_port_busy", "Port 8976 is already in use.")
          },
        },
      )

      const res = await app.request("/api/cloudflare/oauth/start", { method: "POST" })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "oauth_port_busy" })
    })

    it("reports pending, then complete once the callback lands", async () => {
      const { app, listener } = buildApp()
      const { state } = await startOAuthFlow(app)

      const pending = await app.request(
        `/api/cloudflare/oauth/status?state=${encodeURIComponent(state)}`,
      )
      expect(await pending.json()).toMatchObject({
        status: "pending",
        account_choice_required: false,
      })

      await listener.handle?.(
        new URL(`http://localhost:8976/oauth/callback?code=auth-code&state=${state}`),
      )

      const complete = await app.request(
        `/api/cloudflare/oauth/status?state=${encodeURIComponent(state)}`,
      )
      const body = await complete.json()
      expect(body).toMatchObject({
        status: "complete",
        account_choice_required: false,
        account_id: "acct-1",
      })
      expect(JSON.stringify(body)).not.toContain("cf-oauth-access-1")
      expect(JSON.stringify(body)).not.toContain("cf-oauth-refresh-1")
    })

    it("requires the state query param", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/oauth/status")
      expect(res.status).toBe(400)
    })

    it("reports an unknown flow as expired", async () => {
      const { app } = buildApp()
      const res = await app.request("/api/cloudflare/oauth/status?state=gone")
      expect(await res.json()).toMatchObject({ status: "expired", error: "oauth_expired" })
    })

    it("reports a denied consent", async () => {
      const { app, listener } = buildApp()
      const { state } = await startOAuthFlow(app)
      await listener.handle?.(
        new URL(`http://localhost:8976/oauth/callback?error=access_denied&state=${state}`),
      )

      const res = await app.request(
        `/api/cloudflare/oauth/status?state=${encodeURIComponent(state)}`,
      )
      expect(await res.json()).toMatchObject({ status: "error", error: "oauth_denied" })
    })

    it("lists the accounts to pick from and finalises the choice", async () => {
      const { app, listener } = buildApp({
        oauthAccounts: [
          { id: "acct-1", name: "Escola Azul" },
          { id: "acct-2", name: "Escola Verde" },
        ],
      })
      const { state } = await completeOAuthFlow(app, listener)

      const status = await app.request(
        `/api/cloudflare/oauth/status?state=${encodeURIComponent(state)}`,
      )
      expect(await status.json()).toMatchObject({
        status: "complete",
        account_choice_required: true,
        accounts: [
          { id: "acct-1", name: "Escola Azul" },
          { id: "acct-2", name: "Escola Verde" },
        ],
      })

      const picked = await app.request("/api/cloudflare/oauth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, account_id: "acct-2" }),
      })
      expect(picked.status).toBe(200)
      expect(await picked.json()).toEqual({ account_id: "acct-2", account_name: "Escola Verde" })

      const after = await app.request(
        `/api/cloudflare/oauth/status?state=${encodeURIComponent(state)}`,
      )
      expect(await after.json()).toMatchObject({ account_choice_required: false })
    })

    it("409s when the picked account is not part of the login", async () => {
      const { app, listener } = buildApp({
        oauthAccounts: [
          { id: "acct-1", name: "One" },
          { id: "acct-2", name: "Two" },
        ],
      })
      const { state } = await completeOAuthFlow(app, listener)

      const res = await app.request("/api/cloudflare/oauth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, account_id: "acct-9" }),
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "account_choice_required" })
    })

    it("verifies and provisions with the stored grant and no credential headers", async () => {
      const { app, listener, fake } = buildApp()
      await completeOAuthFlow(app, listener)

      const verify = await app.request("/api/cloudflare/verify", { method: "POST" })
      expect(verify.status).toBe(200)
      expect(await verify.json()).toMatchObject({ ok: true, account_name: "Test Account" })
      expect(fake.state.calls.some((call) => call.url.includes("/user/tokens/verify"))).toBe(false)
      expect(fake.state.bearerTokens).toContain("cf-oauth-access-1")

      const provision = await app.request("/api/cloudflare/provision", { method: "POST" })
      const events = parseSSE(await provision.text())
      const last = events.at(-1)
      if (last?.type !== "complete") throw new Error("expected a complete event")
      expect(last.connection).toMatchObject({ connected: true, auth_method: "oauth" })
    })

    it("409s the provision when the account has not been chosen yet", async () => {
      const { app, listener } = buildApp({
        oauthAccounts: [
          { id: "acct-1", name: "One" },
          { id: "acct-2", name: "Two" },
        ],
      })
      await completeOAuthFlow(app, listener)

      const res = await app.request("/api/cloudflare/provision", { method: "POST" })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "account_choice_required" })
    })

    it("lets the manual token through while an account choice is still open", async () => {
      const { app, listener } = buildApp({
        oauthAccounts: [
          { id: "acct-1", name: "One" },
          { id: "acct-2", name: "Two" },
        ],
      })
      await completeOAuthFlow(app, listener)

      const res = await app.request("/api/cloudflare/verify", { method: "POST", headers: AUTH })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true })
    })

    it("401s with reconnect_required once the grant can no longer be refreshed", async () => {
      const fake = createFakeCloudflare({ oauthExpiresIn: 0 })
      const rejectRefresh: FetchLike = async (url, init) => {
        if (url.includes("/oauth2/token") && String(init?.body).includes("grant_type=refresh")) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
        }
        return fake.fetchFn(url, init)
      }
      const { app, listener } = buildApp({}, { fetchFn: rejectRefresh })
      await completeOAuthFlow(app, listener)

      const res = await app.request("/api/cloudflare/verify", { method: "POST" })
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: "reconnect_required" })

      const connection = await app.request("/api/cloudflare/connection")
      expect(await connection.json()).toMatchObject({ connected: false, auth_method: null })
    })
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
        auth_method: "token",
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
      expect(await res.json()).toMatchObject({
        forgotten: false,
        deleted_resources: false,
        oauth_cleared: false,
      })
    })

    it("forgets the oauth grant and revokes it at Cloudflare", async () => {
      const { app, listener, fake } = buildApp()
      await completeOAuthFlow(app, listener)
      createConnectionStore(stateDir).write(record)

      const res = await app.request("/api/cloudflare/connection", { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ forgotten: true, oauth_cleared: true })
      expect(body.connection).toMatchObject({ connected: false, auth_method: null })
      expect(fake.state.revocations[0]).toMatchObject({
        token_type_hint: "refresh_token",
        token: "cf-oauth-refresh-1",
      })

      const after = await app.request("/api/cloudflare/oauth/start", { method: "POST" })
      expect(after.status).toBe(200)
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
