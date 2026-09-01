import type { AccessAttemptKind, PublicationStore } from "./store.js"

/**
 * Brute-force limits for the two doors that verify a short, human-typed secret: the access
 * code on `POST /p/:token/access` and the reviewer PIN on `POST /p/:token/session/claim`.
 *
 * Both are unauthenticated by construction — the code *is* the door — so their strength is
 * not the keyspace but how long the worker is willing to keep answering. A six-character
 * code is 32^6 ≈ 10^9, which is ample against a throttled attacker and nothing at all
 * against an unthrottled one. A four-digit reviewer PIN is 10^4 and needs this far more.
 */

/** How far back failures are counted. */
export const ATTEMPT_WINDOW_SECONDS = 15 * 60

/**
 * Failures from one caller before that caller is refused.
 *
 * Ten, not three: the people typing these codes are often children copying from a board, and
 * a gate that locks after a couple of slips generates a support call rather than security.
 */
export const CLIENT_ATTEMPT_LIMIT = 10

/**
 * Failures against one publication before *every* caller is refused.
 *
 * Deliberately far above the per-caller limit, because this is the one number an attacker can
 * use against the people the link was made for: a stricter ceiling would let anyone lock a
 * class out of its own book by guessing badly on purpose. Sixty failures per quarter hour
 * still caps a distributed guess at roughly 5,760 a day, which against 32^6 is not a threat,
 * while sitting far above what thirty people mistyping a code will ever produce.
 */
export const TOKEN_ATTEMPT_LIMIT = 60

/** Cooldown after the limit trips, doubling per further failure, capped. Returned as
 *  `Retry-After`, so a polite client waits rather than hammering. */
const BASE_COOLDOWN_SECONDS = 30
const MAX_COOLDOWN_SECONDS = 15 * 60

export function cooldownFor(failures: number, limit: number): number {
  const over = Math.max(0, failures - limit) + 1
  return Math.min(MAX_COOLDOWN_SECONDS, BASE_COOLDOWN_SECONDS * 2 ** (over - 1))
}

/**
 * A stable, non-identifying handle for the caller.
 *
 * An HMAC of the address under `MGMT_SECRET`, never the address itself: the counters need to
 * tell callers apart, not to know who they are, and this table would otherwise become a log
 * of who tried to open a book and failed.
 */
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
  /** Which door this attempt is at — see `AccessAttemptKind` in store.ts. Both the counting and
   *  the clearing on success are scoped to it, so the access code and the reviewer PIN never
   *  share, or steal from, one another's budget. */
  kind: AccessAttemptKind
  now: Date
}

export interface ThrottleGate {
  /** `null` when the caller may try. Otherwise the seconds they must wait. */
  refusedFor: number | null
  /** Call after a right secret, so a reader who mistyped twice leaves nothing behind at *this*
   *  door. The other door's counter, if any, is untouched. */
  recordSuccess: () => Promise<void>
}

/**
 * The guard both secret-checking doors put in front of themselves.
 *
 * Record-then-check, not check-then-record: this attempt's own row is written *before* either
 * count is read, so two requests racing the same caller each land their insert before either can
 * read a count that would let the other through — the row a request writes for itself is always
 * part of what it, and everything after it, counts against. A refused attempt is on the record
 * for the same reason: nothing here special-cases "this one will be refused" and skips writing
 * it, so `cooldownFor`'s doubling has a real, growing failure count to escalate from instead of
 * reading the same pre-limit number forever.
 *
 * One helper rather than two call sites doing their own arithmetic: the access code and the
 * reviewer PIN are the same kind of secret with the same kind of attacker, and a limit that
 * applied to one and not the other would simply move the guessing to the weaker door — which is
 * the four-digit PIN, not the six-character code.
 */
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

  /** Strictly greater than, not `>=`: the count above already includes the row this very call
   *  just wrote, so the Nth attempt (this one) is refused only once N exceeds the limit — the
   *  same boundary the old check-before-record shape drew by comparing an un-incremented count
   *  against `>=`. */
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

/** What the platform gives us for the caller's address.
 *
 *  `cf-connecting-ip` only: it is stamped by Cloudflare's edge itself and cannot be set by the
 *  client, unlike `x-forwarded-for`, which used to be trusted as a fallback here — a client that
 *  controls its own throttle-bucket key can pick a fresh one on every request and the limit
 *  above enforces nothing. Its absence (tests, or a request that never reached Cloudflare's edge)
 *  merges every such caller into one constant bucket rather than exempting them — the safe
 *  direction, since it throttles them together instead of letting them each escape the count. */
export function callerIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? "unknown"
}
