import type { AccessAttemptKind, PublicationStore } from "./store.js"

export const ATTEMPT_WINDOW_SECONDS = 15 * 60

export const CLIENT_ATTEMPT_LIMIT = 10

/** Higher than the per-caller limit to reduce distributed guessing without easy lockout. */
const TOKEN_ATTEMPT_LIMIT = 60

/** Cooldown after the limit trips, doubling per further failure, capped. Returned as
 *  `Retry-After`, so a polite client waits rather than hammering. */
const BASE_COOLDOWN_SECONDS = 30
const MAX_COOLDOWN_SECONDS = 15 * 60

export function cooldownFor(failures: number, limit: number): number {
  const over = Math.max(0, failures - limit) + 1
  return Math.min(MAX_COOLDOWN_SECONDS, BASE_COOLDOWN_SECONDS * 2 ** (over - 1))
}

/** Store an HMAC of the address, never the address itself. */
export async function clientHandle(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip))
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export interface ThrottleDeps {
  store: PublicationStore
  secret: string
  ip: string
  token: string
  kind: AccessAttemptKind
  now: Date
}

export interface ThrottleGate {
  refusedFor: number | null
  recordSuccess: () => Promise<void>
}

/** Record before counting so concurrent attempts cannot evade the limit. */
export async function attemptGate(deps: ThrottleDeps): Promise<ThrottleGate> {
  const client = await clientHandle(deps.ip, deps.secret)
  const at = deps.now.toISOString()

  await deps.store.recordAccessFailure({ token: deps.token, client, kind: deps.kind, at })

  const since = new Date(deps.now.getTime() - ATTEMPT_WINDOW_SECONDS * 1000).toISOString()
  const { byClient, byToken } = await deps.store.countAccessFailures({
    token: deps.token,
    client,
    kind: deps.kind,
    since,
  })

  const refusedFor =
    byClient > CLIENT_ATTEMPT_LIMIT
      ? cooldownFor(byClient, CLIENT_ATTEMPT_LIMIT)
      : byToken > TOKEN_ATTEMPT_LIMIT
        ? cooldownFor(byToken, TOKEN_ATTEMPT_LIMIT)
        : null

  return {
    refusedFor,
    recordSuccess: () =>
      deps.store.clearAccessFailures({ token: deps.token, client, kind: deps.kind }),
  }
}

/** Cloudflare sets this header; do not trust client-provided forwarding headers. */
export function callerIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? "unknown"
}
