import type { PublicationStore } from "./store.js"

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

export interface AttemptVerdict {
  allowed: boolean
  /** Seconds to wait, for `Retry-After`. Zero when allowed. */
  retryAfter: number
}

export function cooldownFor(failures: number, limit: number): number {
  const over = Math.max(0, failures - limit) + 1
  return Math.min(MAX_COOLDOWN_SECONDS, BASE_COOLDOWN_SECONDS * 2 ** (over - 1))
}

/**
 * Whether this caller may attempt, given what has already failed.
 *
 * Checked *before* verifying rather than after, so a refused attempt costs no comparison —
 * an attacker cannot use the timing of the answer to learn whether the guess was close.
 */
export async function checkAttemptAllowed(
  store: PublicationStore,
  input: { token: string; client: string; now: Date },
): Promise<AttemptVerdict> {
  const since = new Date(input.now.getTime() - ATTEMPT_WINDOW_SECONDS * 1000).toISOString()
  const { byClient, byToken } = await store.countAccessFailures({
    token: input.token,
    client: input.client,
    since,
  })

  if (byClient >= CLIENT_ATTEMPT_LIMIT) {
    return { allowed: false, retryAfter: cooldownFor(byClient, CLIENT_ATTEMPT_LIMIT) }
  }
  if (byToken >= TOKEN_ATTEMPT_LIMIT) {
    return { allowed: false, retryAfter: cooldownFor(byToken, TOKEN_ATTEMPT_LIMIT) }
  }
  return { allowed: true, retryAfter: 0 }
}

/**
 * A stable, non-identifying handle for the caller.
 *
 * An HMAC of the address under `MGMT_SECRET`, never the address itself: the counters need to
 * tell callers apart, not to know who they are, and this table would otherwise become a log
 * of who tried to open a book and failed. Falls back to a constant when the platform gives no
 * address, which merges those callers into one bucket — the safe direction, since it throttles
 * them together rather than exempting them.
 */
export async function clientHandle(ip: string | undefined, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip ?? "unknown-caller"),
  )
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
