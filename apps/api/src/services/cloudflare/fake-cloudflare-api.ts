import { PUBLISH_WORKER_VERSION, type CloudflareTokenScope } from "@adt/types"
import { CLOUDFLARE_API_BASE_URL, type FetchLike } from "./client.js"

/** Test double for api.cloudflare.com plus the deployed worker's /health. Lives in src so
 *  it is typechecked with the client it mirrors; nothing outside tests imports it. */

export interface FakeUploadedScript {
  script: string
  metadata: Record<string, unknown>
}

export interface FakeCloudflareState {
  databases: Array<{ uuid: string; name: string }>
  buckets: string[]
  bucketObjects: Map<string, string[]>
  scripts: Map<string, FakeUploadedScript>
  subdomainEnabledFor: string[]
  /** The account's workers.dev subdomain, which a provision may register. */
  subdomain: string | null
  subdomainsCreated: string[]
  migrationRows: Array<{ name: string; applied_at: string }>
  executedSql: string[]
  uploadCount: number
  staticAssetManifests: Array<Record<string, unknown>>
  staticAssetUploads: Array<Record<string, string>>
  healthCalls: number
  calls: Array<{ method: string; url: string }>
  tokenRequests: Array<Record<string, string>>
  revocations: Array<Record<string, string>>
  bearerTokens: string[]
  issuedAccessTokens: string[]
  issuedRefreshTokens: string[]
}

export interface FakeCloudflareOptions {
  accountId?: string
  accountName?: string
  tokenInvalid?: boolean
  accountMissing?: boolean
  denyScopes?: CloudflareTokenScope[]
  subdomain?: string | null
  databases?: Array<{ uuid: string; name: string }>
  buckets?: string[]
  bucketObjects?: Record<string, string[]>
  scripts?: string[]
  migrationRows?: Array<{ name: string; applied_at: string }>
  createdDatabaseUuid?: string
  d1CreateConflict?: boolean
  bucketCreateConflict?: boolean
  r2NotEnabled?: boolean
  migrationErrorMessage?: string
  uploadErrorMessage?: string
  rejectMigrationTag?: boolean
  workerVersion?: string
  workerCreateConflict?: boolean
  /** Refuses every script deletion, for testing a teardown that only half succeeds. */
  workerDeleteFails?: boolean
  /** Cloudflare refuses to register a workers.dev subdomain — reported on some accounts, and
   *  the case that sends the author to the dashboard by hand. */
  subdomainCreateForbidden?: boolean
  /** Labels already claimed elsewhere on workers.dev, to exercise the collision retry. */
  subdomainsTaken?: string[]
  healthFailures?: number
  healthUnreachable?: boolean
  assetUploadBuckets?: string[][]
  /** Ask for every hash in the manifest, which is what a real account does on a first publish
   *  when it holds none of the content yet. */
  assetUploadAllBuckets?: boolean
  assetSessionErrorMessage?: string
  assetUploadErrorMessage?: string
  /** Accounts the OAuth grant can see. Defaults to the single configured account. */
  oauthAccounts?: Array<{ id: string; name: string }> | null
  accountsListForbidden?: boolean
  oauthTokenError?: string
  oauthTokenStatus?: number
  oauthExpiresIn?: number
  oauthRefreshTokenAbsent?: boolean
  revokeFails?: boolean
}

export interface FakeCloudflare {
  fetchFn: FetchLike
  state: FakeCloudflareState
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function ok(result: unknown): Response {
  return json({ success: true, errors: [], messages: [], result })
}

function fail(status: number, code: number, message: string): Response {
  return json({ success: false, errors: [{ code, message }], messages: [], result: null }, status)
}

const FORBIDDEN = { status: 403, code: 9109, message: "Unauthorized to access requested resource" }

async function readFormText(body: unknown, field: string): Promise<string> {
  if (!(body instanceof FormData)) return ""
  const value = body.get(field)
  if (value === null) return ""
  return typeof value === "string" ? value : await value.text()
}

export function createFakeCloudflare(options: FakeCloudflareOptions = {}): FakeCloudflare {
  const accountId = options.accountId ?? "acct-1"
  const accountName = options.accountName ?? "Test Account"
  const denied = new Set(options.denyScopes ?? [])

  const state: FakeCloudflareState = {
    databases: [...(options.databases ?? [])],
    buckets: [...(options.buckets ?? [])],
    bucketObjects: new Map(
      Object.entries(options.bucketObjects ?? {}).map(([bucket, keys]) => [bucket, [...keys]]),
    ),
    scripts: new Map((options.scripts ?? []).map((name) => [name, { script: "", metadata: {} }])),
    subdomainEnabledFor: [],
    subdomain: options.subdomain === undefined ? "teacher" : options.subdomain,
    subdomainsCreated: [],
    migrationRows: [...(options.migrationRows ?? [])],
    executedSql: [],
    uploadCount: 0,
    staticAssetManifests: [],
    staticAssetUploads: [],
    healthCalls: 0,
    calls: [],
    tokenRequests: [],
    revocations: [],
    bearerTokens: [],
    issuedAccessTokens: [],
    issuedRefreshTokens: [],
  }

  function formBody(init?: RequestInit): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(String(init?.body ?? "")).entries())
  }

  const fetchFn: FetchLike = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase()
    state.calls.push({ method, url: input })
    const authorization = new Headers(init?.headers).get("Authorization")
    if (authorization?.startsWith("Bearer ")) {
      state.bearerTokens.push(authorization.slice("Bearer ".length))
    }

    if (input.includes("/oauth2/token")) {
      const params = formBody(init)
      state.tokenRequests.push(params)
      if (options.oauthTokenError) {
        return json(
          { error: options.oauthTokenError, error_description: options.oauthTokenError },
          options.oauthTokenStatus ?? 400,
        )
      }
      const issue = state.tokenRequests.length
      const accessToken = `cf-oauth-access-${issue}`
      const refreshToken = `cf-oauth-refresh-${issue}`
      state.issuedAccessTokens.push(accessToken)
      if (!options.oauthRefreshTokenAbsent) state.issuedRefreshTokens.push(refreshToken)
      return json({
        access_token: accessToken,
        ...(options.oauthRefreshTokenAbsent ? {} : { refresh_token: refreshToken }),
        expires_in: options.oauthExpiresIn ?? 3600,
        token_type: "bearer",
        scope: "account:read user:read workers_scripts:write workers:write d1:write",
      })
    }

    if (input.includes("/oauth2/revoke")) {
      state.revocations.push(formBody(init))
      if (options.revokeFails) return json({ error: "invalid_token" }, 400)
      return new Response("", { status: 200 })
    }

    if (input.includes(".workers.dev/health")) {
      state.healthCalls += 1
      if (options.healthUnreachable) {
        throw new TypeError("fetch failed")
      }
      if (state.healthCalls <= (options.healthFailures ?? 0)) {
        throw new TypeError("fetch failed")
      }
      return json({ ok: true, version: options.workerVersion ?? PUBLISH_WORKER_VERSION })
    }

    if (!input.startsWith(CLOUDFLARE_API_BASE_URL)) {
      throw new Error(`Unexpected request to ${input}`)
    }

    const url = new URL(input)
    const route = url.pathname.replace("/client/v4", "")
    const accountPrefix = `/accounts/${accountId}`

    if (route === "/user/tokens/verify") {
      if (options.tokenInvalid) {
        return fail(401, 1000, "Invalid API Token")
      }
      return ok({ id: "token-1", status: "active" })
    }

    if (route === "/accounts" && method === "GET") {
      if (options.accountsListForbidden) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      const accounts =
        options.oauthAccounts === undefined
          ? [{ id: accountId, name: accountName }]
          : (options.oauthAccounts ?? [])
      return ok(accounts)
    }

    if (!route.startsWith(accountPrefix)) {
      return fail(404, 7003, "Could not route to the requested account")
    }

    const path = route.slice(accountPrefix.length)

    if (path === "") {
      if (options.accountMissing) return fail(404, 1003, "Account not found")
      if (denied.has("Account:Read")) return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      return ok({ id: accountId, name: accountName })
    }

    if (path === "/d1/database") {
      if (denied.has("D1:Edit")) return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      if (method === "GET") {
        const name = url.searchParams.get("name")
        return ok(state.databases.filter((entry) => !name || entry.name === name))
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string }
        if (options.d1CreateConflict) {
          return fail(409, 7502, "a database with that name already exists")
        }
        const created = {
          uuid: options.createdDatabaseUuid ?? "db-uuid-1",
          name: body.name ?? "unnamed",
        }
        state.databases.push(created)
        return ok(created)
      }
    }

    const queryMatch = path.match(/^\/d1\/database\/([^/]+)\/query$/)
    if (queryMatch && method === "POST") {
      if (denied.has("D1:Edit")) return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      const body = JSON.parse(String(init?.body ?? "{}")) as { sql?: string; params?: string[] }
      const sql = body.sql ?? ""

      if (/CREATE TABLE IF NOT EXISTS _migrations/i.test(sql)) {
        return ok([{ success: true, results: [] }])
      }
      if (/SELECT name FROM _migrations/i.test(sql)) {
        return ok([
          { success: true, results: state.migrationRows.map((row) => ({ name: row.name })) },
        ])
      }
      if (/INSERT OR IGNORE INTO _migrations/i.test(sql)) {
        const [name, appliedAt] = body.params ?? []
        if (name && !state.migrationRows.some((row) => row.name === name)) {
          state.migrationRows.push({ name, applied_at: appliedAt ?? "" })
        }
        return ok([{ success: true, results: [] }])
      }
      if (options.migrationErrorMessage) {
        return fail(500, 7500, options.migrationErrorMessage)
      }
      state.executedSql.push(sql)
      return ok([{ success: true, results: [] }])
    }

    const d1DeleteMatch = path.match(/^\/d1\/database\/([^/]+)$/)
    if (d1DeleteMatch && method === "DELETE") {
      state.databases = state.databases.filter((entry) => entry.uuid !== d1DeleteMatch[1])
      return ok(null)
    }

    if (path === "/r2/buckets") {
      if (options.r2NotEnabled) {
        return fail(403, 10042, "Please enable R2 through the Cloudflare Dashboard.")
      }
      if (method === "GET") {
        return ok({ buckets: state.buckets.map((name) => ({ name })) })
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string }
        if (options.bucketCreateConflict) {
          return fail(409, 10004, "The bucket you tried to create already exists")
        }
        if (body.name) state.buckets.push(body.name)
        return ok({ name: body.name })
      }
    }

    const bucketObjectsMatch = path.match(/^\/r2\/buckets\/([^/]+)\/objects(?:\/(.*))?$/)
    if (bucketObjectsMatch) {
      const bucket = decodeURIComponent(bucketObjectsMatch[1])
      const keys = state.bucketObjects.get(bucket) ?? []
      if (method === "GET") {
        const query = new URL(input).searchParams
        const startAfter = query.get("start_after")
        const nextIndex = startAfter ? keys.findIndex((key) => key > startAfter) : 0
        const startIndex = nextIndex < 0 ? keys.length : nextIndex
        const limit = Number(query.get("per_page") ?? "1000")
        return ok(keys.slice(startIndex, startIndex + limit).map((key) => ({ key })))
      }
      if (method === "DELETE" && bucketObjectsMatch[2]) {
        const key = bucketObjectsMatch[2]
          .split("/")
          .map((segment) => decodeURIComponent(segment))
          .join("/")
        state.bucketObjects.set(bucket, keys.filter((entry) => entry !== key))
        return ok(null)
      }
    }

    const bucketDeleteMatch = path.match(/^\/r2\/buckets\/([^/]+)$/)
    if (bucketDeleteMatch && method === "DELETE") {
      const bucket = decodeURIComponent(bucketDeleteMatch[1])
      if ((state.bucketObjects.get(bucket) ?? []).length > 0) {
        return fail(409, 10014, "The bucket you tried to delete is not empty")
      }
      state.buckets = state.buckets.filter((name) => name !== bucket)
      state.bucketObjects.delete(bucket)
      return ok(null)
    }

    if (path === "/workers/scripts" && method === "GET") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      return ok([...state.scripts.keys()].map((id) => ({ id })))
    }

    if (path === "/workers/workers" && method === "POST") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string }
      if (!body.name) return fail(400, 10013, "Worker name is required")
      if (options.workerCreateConflict || state.scripts.has(body.name)) {
        return fail(409, 10090, `A Worker with the name '${body.name}' already exists.`)
      }
      state.scripts.set(body.name, { script: "", metadata: {} })
      return ok({ id: body.name, name: body.name })
    }

    if (path === "/workers/subdomain" && method === "GET") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      if (state.subdomain === null) return ok({ subdomain: null })
      return ok({ subdomain: state.subdomain })
    }

    if (path === "/workers/subdomain" && method === "PUT") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      if (options.subdomainCreateForbidden) {
        return fail(403, 10000, "Authentication error")
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { subdomain?: string }
      if (!body.subdomain) return fail(400, 10013, "A subdomain is required")
      if ((options.subdomainsTaken ?? []).includes(body.subdomain)) {
        return fail(409, 10035, `The subdomain ${body.subdomain} is already taken`)
      }
      state.subdomain = body.subdomain
      state.subdomainsCreated.push(body.subdomain)
      return ok({ subdomain: body.subdomain })
    }

    const subdomainMatch = path.match(/^\/workers\/scripts\/([^/]+)\/subdomain$/)
    if (subdomainMatch && method === "POST") {
      state.subdomainEnabledFor.push(decodeURIComponent(subdomainMatch[1]))
      return ok({ enabled: true })
    }

    const scriptMatch = path.match(/^\/workers\/scripts\/([^/]+)$/)
    const assetSessionMatch = path.match(/^\/workers\/scripts\/([^/]+)\/assets-upload-session$/)
    if (assetSessionMatch && method === "POST") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      if (options.assetSessionErrorMessage) {
        return fail(500, 10001, options.assetSessionErrorMessage)
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { manifest?: Record<string, unknown> }
      const manifest = (body.manifest ?? {}) as Record<string, { hash?: string }>
      state.staticAssetManifests.push(manifest)
      const everyHash = Object.values(manifest).flatMap((entry) =>
        typeof entry?.hash === "string" ? [entry.hash] : [],
      )
      const buckets =
        options.assetUploadBuckets ??
        (options.assetUploadAllBuckets && everyHash.length > 0 ? [everyHash] : [])
      return ok({ jwt: "asset-upload-jwt", buckets })
    }

    if (path === "/workers/assets/upload" && method === "POST") {
      if (options.assetUploadErrorMessage) {
        return fail(500, 10001, options.assetUploadErrorMessage)
      }
      const body = await readFormText(init?.body, "body")
      state.staticAssetUploads.push(JSON.parse(body || "{}") as Record<string, string>)
      return ok({ jwt: "asset-complete-jwt" })
    }

    if (scriptMatch && method === "PUT") {
      if (denied.has("Workers Scripts:Edit")) {
        return fail(FORBIDDEN.status, FORBIDDEN.code, FORBIDDEN.message)
      }
      const name = decodeURIComponent(scriptMatch[1])
      const metadataText = await readFormText(init?.body, "metadata")
      const metadata = metadataText ? (JSON.parse(metadataText) as Record<string, unknown>) : {}
      if (options.uploadErrorMessage) {
        return fail(400, 10021, options.uploadErrorMessage)
      }
      if (options.rejectMigrationTag && metadata.migrations !== undefined) {
        return fail(400, 10074, "Migration tag has already been applied to this script")
      }
      const mainModule = String(metadata.main_module ?? "worker.js")
      state.uploadCount += 1
      state.scripts.set(name, {
        script: await readFormText(init?.body, mainModule),
        metadata,
      })
      return ok({ id: name })
    }

    if (scriptMatch && method === "DELETE") {
      if (options.workerDeleteFails) {
        return fail(500, 10001, "Worker could not be deleted")
      }
      state.scripts.delete(decodeURIComponent(scriptMatch[1]))
      return ok(null)
    }

    return fail(404, 7003, `No fake route for ${method} ${path}`)
  }

  return { fetchFn, state }
}
