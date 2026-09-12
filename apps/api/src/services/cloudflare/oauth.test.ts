import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createConnectionStore, type ConnectionStore } from "./connection-store.js"
import { createFakeCloudflare, type FakeCloudflareOptions } from "./fake-cloudflare-api.js"
import {
  CLOUDFLARE_OAUTH_AUTH_URL,
  CLOUDFLARE_OAUTH_CALLBACK_PORT,
  CLOUDFLARE_OAUTH_CLIENT_ID,
  CLOUDFLARE_OAUTH_REDIRECT_URI,
  CLOUDFLARE_OAUTH_SCOPES,
  codeChallengeFor,
  createCloudflareOAuthService,
  generateCodeVerifier,
  isCloudflareOAuthError,
  type CloudflareOAuthService,
  type OAuthCallbackHandler,
  type OAuthCallbackListenerFactory,
} from "./oauth.js"

const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"
const REVOKE_URL = "https://dash.cloudflare.com/oauth2/revoke"

interface ListenerHarness {
  factory: OAuthCallbackListenerFactory
  handle: OAuthCallbackHandler | null
  ports: number[]
  closes: number
}

function listenerHarness(): ListenerHarness {
  const harness: ListenerHarness = {
    factory: async ({ port, handle }) => {
      harness.ports.push(port)
      harness.handle = handle
      return {
        close: async () => {
          harness.closes += 1
        },
      }
    },
    handle: null,
    ports: [],
    closes: 0,
  }
  return harness
}

function callbackUrl(params: Record<string, string>): URL {
  const url = new URL("http://localhost:8976/oauth/callback")
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

describe("cloudflare oauth", () => {
  let tmpDir = ""
  let store: ConnectionStore
  let clock = Date.parse("2026-08-03T12:00:00.000Z")

  function build(
    fakeOptions: FakeCloudflareOptions = {},
    overrides: Partial<Parameters<typeof createCloudflareOAuthService>[0]> = {},
  ): {
    service: CloudflareOAuthService
    listener: ListenerHarness
    fake: ReturnType<typeof createFakeCloudflare>
  } {
    const fake = createFakeCloudflare(fakeOptions)
    const listener = listenerHarness()
    const service = createCloudflareOAuthService({
      store,
      fetchFn: fake.fetchFn,
      now: () => new Date(clock),
      createListener: listener.factory,
      ...overrides,
    })
    return { service, listener, fake }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflare-oauth-"))
    store = createConnectionStore(tmpDir)
    clock = Date.parse("2026-08-03T12:00:00.000Z")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("authorization url", () => {
    it("uses the constants wrangler registered, with a S256 PKCE challenge", async () => {
      const { service, listener } = build()
      const flow = await service.start()
      const url = new URL(flow.authUrl)

      expect(`${url.origin}${url.pathname}`).toBe(CLOUDFLARE_OAUTH_AUTH_URL)
      expect(url.searchParams.get("client_id")).toBe(CLOUDFLARE_OAUTH_CLIENT_ID)
      expect(url.searchParams.get("redirect_uri")).toBe(CLOUDFLARE_OAUTH_REDIRECT_URI)
      expect(url.searchParams.get("response_type")).toBe("code")
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("state")).toBe(flow.state)
      expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(url.searchParams.get("scope")?.split(" ")).toEqual([...CLOUDFLARE_OAUTH_SCOPES])
      expect(url.searchParams.get("scope")).toContain("offline_access")
      expect(listener.ports).toEqual([CLOUDFLARE_OAUTH_CALLBACK_PORT])
    })

    it("never puts the verifier in the url and derives the challenge from it", () => {
      const verifier = generateCodeVerifier()
      expect(verifier).toHaveLength(96)
      expect(codeChallengeFor(verifier)).toBe(
        crypto.createHash("sha256").update(verifier).digest("base64url"),
      )
    })

    it("refuses a second flow while one is still waiting in the browser", async () => {
      const { service } = build()
      await service.start()
      await expect(service.start()).rejects.toMatchObject({ code: "oauth_flow_pending" })
    })
  })

  describe("callback", () => {
    it("exchanges the code, stores the grant and picks the only account", async () => {
      const { service, listener, fake } = build()
      const flow = await service.start()

      const result = await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))

      expect(result?.status).toBe(200)
      expect(result?.html).toContain("Connected to Cloudflare")
      expect(result?.html).toContain("close this tab")
      expect(listener.closes).toBe(1)

      expect(fake.state.tokenRequests[0]).toMatchObject({
        grant_type: "authorization_code",
        code: "auth-code",
        client_id: CLOUDFLARE_OAUTH_CLIENT_ID,
        redirect_uri: CLOUDFLARE_OAUTH_REDIRECT_URI,
      })
      expect(fake.state.tokenRequests[0]?.code_verifier).toMatch(/^[A-Za-z0-9._~-]{96}$/)

      const stored = store.readOAuth()
      expect(stored).toMatchObject({
        token_source: "oauth",
        access_token: "cf-oauth-access-1",
        refresh_token: "cf-oauth-refresh-1",
        account_id: "acct-1",
        account_name: "Test Account",
      })
      expect(stored?.expires_at).toBe("2026-08-03T13:00:00.000Z")

      expect(service.status(flow.state)).toMatchObject({
        status: "complete",
        accountChoiceRequired: false,
        accountId: "acct-1",
      })
    })

    it("keeps the grant file owner-only", async () => {
      const { service, listener } = build()
      const flow = await service.start()
      await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))
      expect(fs.statSync(store.filePath).mode & 0o777).toBe(0o600)
    })

    it("asks the user to choose when the login covers several accounts", async () => {
      const { service, listener } = build({
        oauthAccounts: [
          { id: "acct-1", name: "Escola Azul" },
          { id: "acct-2", name: "Escola Verde" },
        ],
      })
      const flow = await service.start()
      await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))

      const status = service.status(flow.state)
      expect(status).toMatchObject({ status: "complete", accountChoiceRequired: true })
      expect(status.accounts).toEqual([
        { id: "acct-1", name: "Escola Azul" },
        { id: "acct-2", name: "Escola Verde" },
      ])
      expect(store.readOAuth()?.account_id).toBeNull()

      clock += 1000
      const chosen = await service.selectAccount(flow.state, "acct-2")
      expect(chosen).toEqual({ id: "acct-2", name: "Escola Verde" })
      expect(store.readOAuth()).toMatchObject({
        account_id: "acct-2",
        account_name: "Escola Verde",
        access_token: "cf-oauth-access-1",
      })
      expect(service.status(flow.state).accountChoiceRequired).toBe(false)
    })

    it("rejects an account that is not part of the login", async () => {
      const { service, listener } = build({
        oauthAccounts: [
          { id: "acct-1", name: "One" },
          { id: "acct-2", name: "Two" },
        ],
      })
      const flow = await service.start()
      await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))
      await expect(service.selectAccount(flow.state, "acct-9")).rejects.toMatchObject({
        code: "account_choice_required",
      })
    })

    it("refuses a callback whose state does not match and keeps waiting", async () => {
      const { service, listener } = build()
      const flow = await service.start()

      const result = await listener.handle?.(callbackUrl({ code: "auth-code", state: "forged" }))

      expect(result?.status).toBe(400)
      expect(result?.html).toContain("did not come from the login")
      expect(store.readOAuth()).toBeNull()
      expect(service.status(flow.state).status).toBe("pending")
      expect(listener.closes).toBe(0)
    })

    it("reports a denied consent", async () => {
      const { service, listener } = build()
      const flow = await service.start()

      const result = await listener.handle?.(
        callbackUrl({ error: "access_denied", state: flow.state }),
      )

      expect(result?.html).toContain("Could not finish connecting")
      expect(service.status(flow.state)).toMatchObject({
        status: "error",
        errorCode: "oauth_denied",
      })
      expect(store.readOAuth()).toBeNull()
    })

    it("reports a rejected exchange without storing anything", async () => {
      const { service, listener } = build({ oauthTokenError: "invalid_grant" })
      const flow = await service.start()
      await listener.handle?.(callbackUrl({ code: "stale", state: flow.state }))

      expect(service.status(flow.state)).toMatchObject({
        status: "error",
        errorCode: "oauth_exchange_failed",
      })
      expect(store.readOAuth()).toBeNull()
    })

    it("explains a login that has no usable account", async () => {
      const { service, listener } = build({ oauthAccounts: null })
      const flow = await service.start()
      await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))

      expect(service.status(flow.state)).toMatchObject({
        status: "error",
        errorCode: "oauth_no_accounts",
      })
      expect(store.readOAuth()).toBeNull()
    })
  })

  describe("expiry", () => {
    it("expires a flow that is never finished and stops listening", async () => {
      const { service, listener } = build({}, { flowTtlMs: 60_000 })
      const flow = await service.start()
      expect(service.status(flow.state).status).toBe("pending")

      clock += 61_000
      expect(service.status(flow.state)).toMatchObject({
        status: "expired",
        errorCode: "oauth_expired",
      })
      expect(listener.closes).toBe(1)
    })

    it("treats an unknown state as expired", () => {
      const { service } = build()
      expect(service.status("never-existed")).toMatchObject({
        status: "expired",
        errorCode: "oauth_expired",
      })
    })
  })

  describe("refresh", () => {
    async function connect(fakeOptions: FakeCloudflareOptions = {}) {
      const built = build(fakeOptions)
      const flow = await built.service.start()
      await built.listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))
      return built
    }

    it("returns the stored grant untouched while it is still fresh", async () => {
      const { service, fake } = await connect()
      const fresh = await service.ensureFreshToken()
      expect(fresh?.access_token).toBe("cf-oauth-access-1")
      expect(fake.state.tokenRequests).toHaveLength(1)
    })

    it("refreshes inside the expiry margin and persists the rotated refresh token", async () => {
      const { service, fake } = await connect()
      clock += 3600_000 - 30_000

      const fresh = await service.ensureFreshToken()

      expect(fresh?.access_token).toBe("cf-oauth-access-2")
      expect(fresh?.refresh_token).toBe("cf-oauth-refresh-2")
      expect(store.readOAuth()?.refresh_token).toBe("cf-oauth-refresh-2")
      expect(store.readOAuth()?.account_id).toBe("acct-1")
      expect(fake.state.tokenRequests[1]).toMatchObject({
        grant_type: "refresh_token",
        refresh_token: "cf-oauth-refresh-1",
        client_id: CLOUDFLARE_OAUTH_CLIENT_ID,
      })
    })

    it("keeps the previous refresh token when Cloudflare returns none", async () => {
      const { service } = await connect()
      const stored = store.readOAuth()
      if (!stored) throw new Error("expected a stored grant")
      store.writeOAuth({ ...stored, expires_at: new Date(clock).toISOString() })

      const fake = createFakeCloudflare({ oauthRefreshTokenAbsent: true })
      const refreshOnly = createCloudflareOAuthService({
        store,
        fetchFn: fake.fetchFn,
        now: () => new Date(clock),
      })

      const fresh = await refreshOnly.ensureFreshToken()
      expect(fresh?.refresh_token).toBe("cf-oauth-refresh-1")
      expect(store.readOAuth()?.refresh_token).toBe("cf-oauth-refresh-1")
    })

    it("dedupes concurrent refreshes into one token request", async () => {
      const { service, fake } = await connect()
      clock += 3600_000

      const [first, second, third] = await Promise.all([
        service.ensureFreshToken(),
        service.ensureFreshToken(),
        service.ensureFreshToken(),
      ])

      expect(fake.state.tokenRequests).toHaveLength(2)
      expect(first?.access_token).toBe("cf-oauth-access-2")
      expect(second?.access_token).toBe("cf-oauth-access-2")
      expect(third?.access_token).toBe("cf-oauth-access-2")
    })

    it("clears the grant and asks for a reconnect when the refresh is revoked", async () => {
      const { service } = await connect()
      const stored = store.readOAuth()
      if (!stored) throw new Error("expected a stored grant")
      store.writeOAuth({ ...stored, expires_at: new Date(clock).toISOString() })

      const fake = createFakeCloudflare({ oauthTokenError: "invalid_grant" })
      const revoked = createCloudflareOAuthService({
        store,
        fetchFn: fake.fetchFn,
        now: () => new Date(clock),
      })

      await expect(revoked.ensureFreshToken()).rejects.toSatisfy(
        (error: unknown) => isCloudflareOAuthError(error) && error.code === "reconnect_required",
      )
      expect(store.readOAuth()).toBeNull()
      expect(await revoked.ensureFreshToken()).toBeNull()
    })

    it("keeps a connection record intact when the grant is cleared", async () => {
      const { service } = await connect()
      store.write({
        account_id: "acct-1",
        account_name: "Test Account",
        worker_name: "adt-publish",
        worker_url: "https://adt-publish.teacher.workers.dev",
        worker_version: "0.1.0",
        worker_migration_tag: "v1",
        workers_dev_subdomain: "teacher",
        d1_database_name: "adt-publish",
        d1_database_uuid: "db-uuid-1",
        r2_bucket_name: "adt-publish-snapshots",
        mgmt_secret: "mgmt-secret-1",
        provisioned_at: "2026-08-03T12:00:00.000Z",
        updated_at: "2026-08-03T12:00:00.000Z",
      })

      expect(await service.signOut()).toBe(true)
      expect(store.readOAuth()).toBeNull()
      expect(store.read()?.mgmt_secret).toBe("mgmt-secret-1")
    })

    it("revokes the refresh token on sign out", async () => {
      const { service, fake } = await connect()
      expect(await service.signOut()).toBe(true)
      expect(fake.state.revocations[0]).toMatchObject({
        client_id: CLOUDFLARE_OAUTH_CLIENT_ID,
        token_type_hint: "refresh_token",
        token: "cf-oauth-refresh-1",
      })
      expect(store.readOAuth()).toBeNull()
      expect(await service.signOut()).toBe(false)
    })

    it("still forgets the grant when the revoke call fails", async () => {
      const { service } = await connect({ revokeFails: true })
      expect(await service.signOut()).toBe(true)
      expect(store.readOAuth()).toBeNull()
    })
  })

  describe("callback listener", () => {
    it("serves the callback over loopback and reports a busy port", async () => {
      const squatter = http.createServer(() => {})
      const port = await new Promise<number>((resolve) => {
        squatter.listen(0, "127.0.0.1", () => {
          const address = squatter.address()
          resolve(typeof address === "object" && address ? address.port : 0)
        })
      })

      try {
        const fake = createFakeCloudflare()
        const busy = createCloudflareOAuthService({
          store,
          fetchFn: fake.fetchFn,
          callbackPort: port,
        })
        await expect(busy.start()).rejects.toMatchObject({ code: "oauth_port_busy" })
      } finally {
        await new Promise<void>((resolve) => squatter.close(() => resolve()))
      }

      const fake = createFakeCloudflare()
      const service = createCloudflareOAuthService({
        store,
        fetchFn: fake.fetchFn,
        callbackPort: port,
        redirectUri: `http://localhost:${port}/oauth/callback`,
      })
      const flow = await service.start()

      const denied = await fetch(
        `http://127.0.0.1:${port}/oauth/callback?error=access_denied&state=${flow.state}`,
      )
      expect(denied.status).toBe(200)
      expect(denied.headers.get("content-type")).toContain("text/html")
      expect(await denied.text()).toContain("Could not finish connecting")
      expect(service.status(flow.state).errorCode).toBe("oauth_denied")

      await service.cancelAll()
    })
  })

  it("never writes an access token into a token url or a log-shaped string", async () => {
    const { service, listener } = build()
    const flow = await service.start()
    await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))

    expect(flow.authUrl).not.toContain("cf-oauth-access-1")
    expect(JSON.stringify(service.status(flow.state))).not.toContain("cf-oauth-access-1")
    expect(JSON.stringify(service.status(flow.state))).not.toContain("cf-oauth-refresh-1")
  })

  it("posts form-encoded bodies to the wrangler token and revoke endpoints", async () => {
    const { service, listener, fake } = build()
    const flow = await service.start()
    await listener.handle?.(callbackUrl({ code: "auth-code", state: flow.state }))
    await service.signOut()

    const tokenCall = fake.state.calls.find((call) => call.url === TOKEN_URL)
    const revokeCall = fake.state.calls.find((call) => call.url === REVOKE_URL)
    expect(tokenCall).toMatchObject({ method: "POST" })
    expect(revokeCall).toMatchObject({ method: "POST" })
  })
})
