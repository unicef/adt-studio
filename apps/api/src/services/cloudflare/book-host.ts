import crypto from "node:crypto"

/** Cloudflare's rule: "Alphanumeric characters (`a`, `b`, `c`, etc.) and dashes (`-`) only.
 * Do not use underscores (`_`)", and for anything routable on workers.dev, "the name must be
 * 63 characters or less and cannot start or end with a dash". */
export const MAX_WORKERS_DEV_NAME_LENGTH = 63

export const BOOK_WORKER_NAME_PREFIX = "adt-book-"

/** 128 bits. Collisions are the thing that would silently overwrite one book with another, and
 * an account can host ~99 of them, so this is many orders of magnitude of headroom. */
const NAME_DIGEST_LENGTH = 32

/** Lowercase only. Worker names become workers.dev hostnames and DNS is case-insensitive, so a
 * mixed-case name is at best ambiguous; the derived names are hex, so this costs nothing. */
const LEGAL_WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export function isLegalWorkerName(name: string): boolean {
  return name.length <= MAX_WORKERS_DEV_NAME_LENGTH && LEGAL_WORKER_NAME.test(name)
}

/**
 * The Worker that hosts one book's assets, named from its publication token.
 *
 * The token cannot be used directly. It is base64url — `/^[A-Za-z0-9_-]{22,64}$/` — which
 * breaks every one of Cloudflare's three rules at once: `_` is not a legal character, `-` can
 * land on either end, and `adt-book-` plus a 64-character token is 73, over the 63 limit.
 * Deriving sidesteps all three and yields a fixed 41 characters regardless of the token.
 *
 * One-way on purpose: the publication row stores the name it was given, so nothing ever has to
 * recover a token from a Worker.
 */
export function bookWorkerName(token: string): string {
  const digest = crypto.createHash("sha256").update(token).digest("hex")
  return `${BOOK_WORKER_NAME_PREFIX}${digest.slice(0, NAME_DIGEST_LENGTH)}`
}
