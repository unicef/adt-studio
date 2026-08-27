import crypto from "node:crypto"
import http from "node:http"
import {
  type CloudflareOAuthAccount,
  type CloudflareOAuthErrorCode,
  type CloudflareOAuthFlowStatus,
} from "@adt/types"
import { listCloudflareAccounts, type FetchLike } from "./client.js"
import {
  type CloudflareOAuthRecord,
  type ConnectionStore,
} from "./connection-store.js"
import { describeError } from "./errors.js"

/** Cloudflare's dash OAuth endpoints, public client id and registered redirect URI, read
 *  out of the installed wrangler bundle (`wrangler-dist/cli.js`, originally
 *  `../workers-auth/dist/wrangler/index.mjs` and `../workers-auth/dist/chunk-5WRJ2ZUV.mjs`):
 *  `OAUTH_CALLBACK_URL`, `getClientIdFromEnv`, `getAuthUrlFromEnv`, `getTokenUrlFromEnv`,
 *  `getRevokeUrlFromEnv`, `RECOMMENDED_CODE_VERIFIER_LENGTH`, `RECOMMENDED_STATE_LENGTH`,
 *  `PKCE_CHARSET` and `DefaultScopes`. The redirect URI is registered against that client
 *  id, so neither the port nor the path can be changed here. */
export const CLOUDFLARE_OAUTH_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth"
export const CLOUDFLARE_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"
export const CLOUDFLARE_OAUTH_REVOKE_URL = "https://dash.cloudflare.com/oauth2/revoke"
export const CLOUDFLARE_OAUTH_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
export const CLOUDFLARE_OAUTH_CALLBACK_HOST = "127.0.0.1"
export const CLOUDFLARE_OAUTH_CALLBACK_PORT = 8976
export const CLOUDFLARE_OAUTH_CALLBACK_PATH = "/oauth/callback"
export const CLOUDFLARE_OAUTH_REDIRECT_URI = "http://localhost:8976/oauth/callback"

/** Minimal set for the provisioner: `account:read` reads the account and its name,
 *  `user:read` covers the `GET /accounts` membership listing that resolves the account id,
 *  `workers_scripts:write` covers the script upload with its Durable Object migration, the
 *  workers.dev subdomain and the secret binding, `d1:write` covers the database and its
 *  migrations, and `workers:write` is the only scope Cloudflare exposes that reaches the R2
 *  bucket endpoints. `offline_access` is what makes the grant refreshable. */
export const CLOUDFLARE_OAUTH_SCOPES: readonly string[] = [
  "account:read",
  "user:read",
  "workers_scripts:write",
  "workers:write",
  "d1:write",
  "offline_access",
]

const PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
const CODE_VERIFIER_LENGTH = 96
const STATE_LENGTH = 32

export const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000
export const OAUTH_REFRESH_MARGIN_MS = 60 * 1000

export class CloudflareOAuthError extends Error {
  readonly code: CloudflareOAuthErrorCode

  constructor(code: CloudflareOAuthErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "CloudflareOAuthError"
    this.code = code
  }
}

export function isCloudflareOAuthError(error: unknown): error is CloudflareOAuthError {
  return error instanceof CloudflareOAuthError
}

function randomFromCharset(length: number): string {
  const bytes = crypto.randomBytes(length)
  let out = ""
  for (const byte of bytes) {
    out += PKCE_CHARSET[byte % PKCE_CHARSET.length]
  }
  return out
}

export function generateCodeVerifier(): string {
  return randomFromCharset(CODE_VERIFIER_LENGTH)
}

export function generateState(): string {
  return randomFromCharset(STATE_LENGTH)
}

export function codeChallengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

export interface AuthorizationUrlInput {
  state: string
  codeChallenge: string
  scopes?: readonly string[]
  authUrl?: string
  clientId?: string
  redirectUri?: string
}

export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId ?? CLOUDFLARE_OAUTH_CLIENT_ID,
    redirect_uri: input.redirectUri ?? CLOUDFLARE_OAUTH_REDIRECT_URI,
    scope: (input.scopes ?? CLOUDFLARE_OAUTH_SCOPES).join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  })
  return `${input.authUrl ?? CLOUDFLARE_OAUTH_AUTH_URL}?${params.toString()}`
}

export interface OAuthTokenResponse {
  accessToken: string
  refreshToken: string | null
  expiresInSeconds: number
  scopes: string[]
}

interface TokenEndpointOptions {
  fetchFn?: FetchLike
  tokenUrl?: string
  clientId?: string
}

async function postToTokenEndpoint(
  params: URLSearchParams,
  options: TokenEndpointOptions,
): Promise<OAuthTokenResponse> {
  const fetchFn: FetchLike = options.fetchFn ?? ((input, init) => fetch(input, init))
  const response = await fetchFn(options.tokenUrl ?? CLOUDFLARE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    payload = {}
  }

  if (!response.ok || typeof payload.error === "string") {
    const detail =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `status ${response.status}`
    throw new CloudflareOAuthError(
      "oauth_exchange_failed",
      `Cloudflare rejected the login: ${detail}`,
    )
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : ""
  if (!accessToken) {
    throw new CloudflareOAuthError(
      "oauth_exchange_failed",
      "Cloudflare returned no access token for this login.",
    )
  }

  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string" && payload.refresh_token.length > 0
        ? payload.refresh_token
        : null,
    expiresInSeconds: typeof payload.expires_in === "number" ? payload.expires_in : 0,
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
  }
}

export function exchangeAuthorizationCode(
  input: { code: string; codeVerifier: string; redirectUri?: string },
  options: TokenEndpointOptions = {},
): Promise<OAuthTokenResponse> {
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri ?? CLOUDFLARE_OAUTH_REDIRECT_URI,
      client_id: options.clientId ?? CLOUDFLARE_OAUTH_CLIENT_ID,
      code_verifier: input.codeVerifier,
    }),
    options,
  )
}

export function exchangeRefreshToken(
  refreshToken: string,
  options: TokenEndpointOptions = {},
): Promise<OAuthTokenResponse> {
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: options.clientId ?? CLOUDFLARE_OAUTH_CLIENT_ID,
    }),
    options,
  )
}

export async function revokeRefreshToken(
  refreshToken: string,
  options: { fetchFn?: FetchLike; revokeUrl?: string; clientId?: string } = {},
): Promise<boolean> {
  const fetchFn: FetchLike = options.fetchFn ?? ((input, init) => fetch(input, init))
  try {
    const response = await fetchFn(options.revokeUrl ?? CLOUDFLARE_OAUTH_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId ?? CLOUDFLARE_OAUTH_CLIENT_ID,
        token_type_hint: "refresh_token",
        token: refreshToken,
      }).toString(),
    })
    return response.ok
  } catch {
    return false
  }
}

export interface OAuthCallbackResult {
  status: number
  html: string
}

export interface OAuthCallbackListener {
  close(): Promise<void>
}

export type OAuthCallbackHandler = (url: URL) => Promise<OAuthCallbackResult>

export type OAuthCallbackListenerFactory = (options: {
  port: number
  host: string
  handle: OAuthCallbackHandler
}) => Promise<OAuthCallbackListener>

function page(title: string, body: string, accent: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f9;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b">
<main style="max-width:26rem;padding:2rem 2.25rem;background:#fff;border:1px solid #e4e4e7;border-radius:0.9rem;box-shadow:0 1px 2px rgba(0,0,0,.04);text-align:center">
<div style="width:2.5rem;height:2.5rem;margin:0 auto 1rem;border-radius:999px;background:${accent}"></div>
<h1 style="margin:0 0 .5rem;font-size:1.125rem;line-height:1.4">${title}</h1>
<p style="margin:0;font-size:.9375rem;line-height:1.6;color:#52525b">${body}</p>
</main></body></html>
`
}

/** Served by the API's temporary callback listener, not by the Studio SPA, so these two
 *  pages are outside the Lingui catalogs and stay in plain English. */
export const OAUTH_SUCCESS_PAGE = page(
  "Connected to Cloudflare",
  "You can close this tab and return to ADT Studio.",
  "#16a34a",
)

export function oauthErrorPage(detail: string): string {
  return page("Could not finish connecting", detail, "#dc2626")
}

const defaultListenerFactory: OAuthCallbackListenerFactory = async ({ port, host, handle }) => {
  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`)
      const result = await handle(url)
      response.writeHead(result.status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      })
      response.end(result.html)
    })()
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.close()
      if (error.code === "EADDRINUSE") {
        reject(
          new CloudflareOAuthError(
            "oauth_port_busy",
            `Port ${port} on this computer is already in use, so Cloudflare cannot send the login back. Close any other app that is signing in to Cloudflare (another ADT Studio window, or wrangler) and try again, or connect with an API token instead.`,
            error,
          ),
        )
        return
      }
      reject(
        new CloudflareOAuthError(
          "oauth_exchange_failed",
          `Could not listen on port ${port}: ${describeError(error)}`,
          error,
        ),
      )
    }
    server.once("error", onError)
    server.listen(port, host, () => {
      server.removeListener("error", onError)
      server.on("error", () => {})
      resolve()
    })
  })

  server.unref()

  /** Resolves as soon as the listening socket is closed, without waiting for the request
   *  in flight: the flow is released from inside the callback handler, so waiting for that
   *  same response to finish would deadlock. */
  return {
    close: () => {
      server.close()
      server.closeIdleConnections()
      return Promise.resolve()
    },
  }
}

interface PendingFlow {
  state: string
  codeVerifier: string
  createdAt: number
  status: CloudflareOAuthFlowStatus
  errorCode: CloudflareOAuthErrorCode | null
  errorMessage: string | null
  accounts: CloudflareOAuthAccount[]
  accountId: string | null
  listener: OAuthCallbackListener | null
  timer: NodeJS.Timeout | null
}

export interface OAuthFlowStart {
  authUrl: string
  state: string
}

export interface OAuthFlowStatus {
  status: CloudflareOAuthFlowStatus
  errorCode: CloudflareOAuthErrorCode | null
  errorMessage: string | null
  accounts: CloudflareOAuthAccount[]
  accountChoiceRequired: boolean
  accountId: string | null
}

export interface CloudflareOAuthServiceOptions {
  store: ConnectionStore
  fetchFn?: FetchLike
  now?: () => Date
  callbackPort?: number
  callbackHost?: string
  redirectUri?: string
  authUrl?: string
  tokenUrl?: string
  revokeUrl?: string
  clientId?: string
  apiBaseUrl?: string
  createListener?: OAuthCallbackListenerFactory
  flowTtlMs?: number
}

export interface CloudflareOAuthService {
  start(): Promise<OAuthFlowStart>
  status(state: string): OAuthFlowStatus
  selectAccount(state: string, accountId: string): Promise<CloudflareOAuthAccount>
  ensureFreshToken(): Promise<CloudflareOAuthRecord | null>
  signOut(): Promise<boolean>
  cancelAll(): Promise<void>
}

export function createCloudflareOAuthService(
  options: CloudflareOAuthServiceOptions,
): CloudflareOAuthService {
  const {
    store,
    fetchFn,
    now = () => new Date(),
    callbackPort = CLOUDFLARE_OAUTH_CALLBACK_PORT,
    callbackHost = CLOUDFLARE_OAUTH_CALLBACK_HOST,
    redirectUri = CLOUDFLARE_OAUTH_REDIRECT_URI,
    createListener = defaultListenerFactory,
    flowTtlMs = OAUTH_FLOW_TTL_MS,
  } = options

  const tokenOptions: TokenEndpointOptions = {
    ...(fetchFn === undefined ? {} : { fetchFn }),
    ...(options.tokenUrl === undefined ? {} : { tokenUrl: options.tokenUrl }),
    ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
  }

  const flows = new Map<string, PendingFlow>()
  let refreshInFlight: Promise<CloudflareOAuthRecord | null> | null = null

  async function releaseListener(flow: PendingFlow): Promise<void> {
    if (flow.timer) {
      clearTimeout(flow.timer)
      flow.timer = null
    }
    const listener = flow.listener
    flow.listener = null
    if (listener) await listener.close()
  }

  function expireIfStale(flow: PendingFlow): void {
    if (flow.status !== "pending") return
    if (now().getTime() - flow.createdAt < flowTtlMs) return
    flow.status = "expired"
    flow.errorCode = "oauth_expired"
    flow.errorMessage =
      "The Cloudflare login window expired before it was finished. Start the connection again."
    void releaseListener(flow)
  }

  function pruneFlows(): void {
    for (const flow of flows.values()) {
      expireIfStale(flow)
      if (flow.status !== "pending" && now().getTime() - flow.createdAt > flowTtlMs * 2) {
        void releaseListener(flow)
        flows.delete(flow.state)
      }
    }
  }

  function pendingFlow(): PendingFlow | null {
    for (const flow of flows.values()) {
      if (flow.status === "pending") return flow
    }
    return null
  }

  function persist(
    token: OAuthTokenResponse,
    accounts: CloudflareOAuthAccount[],
    accountId: string | null,
  ): void {
    const timestamp = now()
    const chosen = accounts.find((account) => account.id === accountId) ?? null
    store.writeOAuth({
      token_source: "oauth",
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: new Date(timestamp.getTime() + token.expiresInSeconds * 1000).toISOString(),
      scopes: token.scopes.length > 0 ? token.scopes : [...CLOUDFLARE_OAUTH_SCOPES],
      account_id: accountId,
      account_name: chosen ? chosen.name : null,
      updated_at: timestamp.toISOString(),
    })
  }

  async function handleCallback(flow: PendingFlow, url: URL): Promise<OAuthCallbackResult> {
    const state = url.searchParams.get("state") ?? ""
    if (state !== flow.state) {
      return {
        status: 400,
        html: oauthErrorPage(
          "This page did not come from the login that ADT Studio started. Close it and try connecting again.",
        ),
      }
    }

    const denial = url.searchParams.get("error")
    if (denial) {
      flow.status = "error"
      flow.errorCode = denial === "access_denied" ? "oauth_denied" : "oauth_exchange_failed"
      flow.errorMessage =
        denial === "access_denied"
          ? "Cloudflare access was not granted. ADT Studio cannot publish until you allow it."
          : `Cloudflare reported "${denial}" instead of a login code.`
      await releaseListener(flow)
      return { status: 200, html: oauthErrorPage(String(flow.errorMessage)) }
    }

    const code = url.searchParams.get("code")
    if (!code) {
      flow.status = "error"
      flow.errorCode = "oauth_exchange_failed"
      flow.errorMessage = "Cloudflare sent no login code back to ADT Studio."
      await releaseListener(flow)
      return { status: 400, html: oauthErrorPage(String(flow.errorMessage)) }
    }

    try {
      const token = await exchangeAuthorizationCode(
        { code, codeVerifier: flow.codeVerifier, redirectUri },
        tokenOptions,
      )
      const accounts = await listCloudflareAccounts({
        token: token.accessToken,
        ...(fetchFn === undefined ? {} : { fetchFn }),
        ...(options.apiBaseUrl === undefined ? {} : { baseUrl: options.apiBaseUrl }),
      })

      if (accounts.length === 0) {
        flow.status = "error"
        flow.errorCode = "oauth_no_accounts"
        flow.errorMessage =
          "This Cloudflare login has no account ADT Studio can publish into. Create an account in Cloudflare, then connect again."
        await releaseListener(flow)
        return { status: 200, html: oauthErrorPage(String(flow.errorMessage)) }
      }

      const accountId = accounts.length === 1 ? String(accounts[0]?.id) : null
      persist(token, accounts, accountId)

      flow.status = "complete"
      flow.accounts = accounts
      flow.accountId = accountId
      flow.errorCode = null
      flow.errorMessage = null
      await releaseListener(flow)
      return { status: 200, html: OAUTH_SUCCESS_PAGE }
    } catch (error) {
      flow.status = "error"
      flow.errorCode = isCloudflareOAuthError(error) ? error.code : "oauth_exchange_failed"
      flow.errorMessage = describeError(error)
      await releaseListener(flow)
      return { status: 200, html: oauthErrorPage(String(flow.errorMessage)) }
    }
  }

  return {
    async start() {
      pruneFlows()
      if (pendingFlow()) {
        throw new CloudflareOAuthError(
          "oauth_flow_pending",
          "A Cloudflare login is already waiting in the browser. Finish it, or wait a moment and start again.",
        )
      }

      const codeVerifier = generateCodeVerifier()
      const state = generateState()
      const flow: PendingFlow = {
        state,
        codeVerifier,
        createdAt: now().getTime(),
        status: "pending",
        errorCode: null,
        errorMessage: null,
        accounts: [],
        accountId: null,
        listener: null,
        timer: null,
      }

      flow.listener = await createListener({
        port: callbackPort,
        host: callbackHost,
        handle: (url) => handleCallback(flow, url),
      })

      const timer = setTimeout(() => {
        expireIfStale(flow)
      }, flowTtlMs)
      timer.unref?.()
      flow.timer = timer
      flows.set(state, flow)

      return {
        authUrl: buildAuthorizationUrl({
          state,
          codeChallenge: codeChallengeFor(codeVerifier),
          ...(options.authUrl === undefined ? {} : { authUrl: options.authUrl }),
          ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
          redirectUri,
        }),
        state,
      }
    },

    status(state) {
      pruneFlows()
      const flow = flows.get(state)
      if (!flow) {
        return {
          status: "expired",
          errorCode: "oauth_expired",
          errorMessage:
            "This connection attempt is no longer active. Start the connection again.",
          accounts: [],
          accountChoiceRequired: false,
          accountId: null,
        }
      }
      expireIfStale(flow)
      return {
        status: flow.status,
        errorCode: flow.errorCode,
        errorMessage: flow.errorMessage,
        accounts: flow.accounts,
        accountChoiceRequired: flow.status === "complete" && flow.accountId === null,
        accountId: flow.accountId,
      }
    },

    async selectAccount(state, accountId) {
      pruneFlows()
      const flow = flows.get(state)
      if (!flow || flow.status !== "complete") {
        throw new CloudflareOAuthError(
          "oauth_expired",
          "This connection attempt is no longer active. Start the connection again.",
        )
      }
      const account = flow.accounts.find((entry) => entry.id === accountId)
      if (!account) {
        throw new CloudflareOAuthError(
          "account_choice_required",
          "That Cloudflare account is not part of this login. Pick one of the listed accounts.",
        )
      }
      const stored = store.readOAuth()
      if (!stored) {
        throw new CloudflareOAuthError(
          "reconnect_required",
          "The Cloudflare login was not kept. Connect to Cloudflare again.",
        )
      }
      store.writeOAuth({
        ...stored,
        account_id: account.id,
        account_name: account.name,
        updated_at: now().toISOString(),
      })
      flow.accountId = account.id
      return account
    },

    ensureFreshToken() {
      const stored = store.readOAuth()
      if (!stored) return Promise.resolve(null)

      const expiresAt = new Date(stored.expires_at).getTime()
      if (Number.isFinite(expiresAt) && expiresAt - now().getTime() > OAUTH_REFRESH_MARGIN_MS) {
        return Promise.resolve(stored)
      }

      if (refreshInFlight) return refreshInFlight

      refreshInFlight = (async () => {
        const current = store.readOAuth()
        if (!current) return null
        if (!current.refresh_token) {
          store.clearOAuth()
          throw new CloudflareOAuthError(
            "reconnect_required",
            "The Cloudflare login expired and cannot be renewed. Connect to Cloudflare again.",
          )
        }
        try {
          const token = await exchangeRefreshToken(current.refresh_token, tokenOptions)
          const timestamp = now()
          const rotated: CloudflareOAuthRecord = {
            ...current,
            access_token: token.accessToken,
            refresh_token: token.refreshToken ?? current.refresh_token,
            expires_at: new Date(
              timestamp.getTime() + token.expiresInSeconds * 1000,
            ).toISOString(),
            scopes: token.scopes.length > 0 ? token.scopes : current.scopes,
            updated_at: timestamp.toISOString(),
          }
          store.writeOAuth(rotated)
          return rotated
        } catch (error) {
          store.clearOAuth()
          throw new CloudflareOAuthError(
            "reconnect_required",
            `The Cloudflare login is no longer valid (${describeError(error)}). Connect to Cloudflare again.`,
            error,
          )
        }
      })()

      const settled = refreshInFlight
      settled.catch(() => {}).finally(() => {
        if (refreshInFlight === settled) refreshInFlight = null
      })
      return settled
    },

    async signOut() {
      const stored = store.readOAuth()
      if (!stored) return false
      if (stored.refresh_token) {
        await revokeRefreshToken(stored.refresh_token, {
          ...(fetchFn === undefined ? {} : { fetchFn }),
          ...(options.revokeUrl === undefined ? {} : { revokeUrl: options.revokeUrl }),
          ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
        })
      }
      return store.clearOAuth()
    },

    async cancelAll() {
      for (const flow of flows.values()) {
        await releaseListener(flow)
      }
      flows.clear()
    },
  }
}
