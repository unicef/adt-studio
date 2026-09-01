import {
  COMMENTER_COLORS,
  COMMENTER_NAME_MAX_LENGTH,
  PUBLICATION_ACCESS_MAX_AGE_SECONDS,
  PUBLISH_AUTHOR_COLOR,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  type CommenterSession,
} from "@adt/types"

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function randomId(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** Colors rotate over `COMMENTER_COLORS` by how many commenters a publication already has,
 *  so the assignment is deterministic per publication and stable per session. */
export function commenterColor(existingCommenters: number): string {
  const index = existingCommenters % COMMENTER_COLORS.length
  return COMMENTER_COLORS[index] as string
}

/** One author session per publication with a derived id: the author's authority is
 *  `MGMT_SECRET`, never the session row, so this id does not have to be unguessable. */
export function authorSessionId(token: string): string {
  return `author-${token}`
}

export function authorSessionMarker(token: string, name?: string | null): CommenterSession {
  return {
    id: authorSessionId(token),
    name: name ?? PUBLISH_AUTHOR_DEFAULT_NAME,
    color: PUBLISH_AUTHOR_COLOR,
    is_author: true,
  }
}

export function normalizeDisplayName(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > COMMENTER_NAME_MAX_LENGTH) return null
  return trimmed
}

/** The comparison key behind "this name is already taken on this publication". NFC first so a
 *  name typed with combining accents matches the same name typed with precomposed ones, and
 *  `toLowerCase` (not `toLocaleLowerCase`) so the key never depends on the worker's locale. */
export function nameKey(value: string): string {
  return value.trim().normalize("NFC").toLowerCase()
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return mismatch === 0
}

export async function hmacTag(payload: string, secret: string): Promise<string> {
  return tagFor(payload, secret)
}

async function tagFor(sessionId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(sessionId))
  return base64url(new Uint8Array(signature))
}

/** The cookie carries `<session id>.<HMAC tag>` rather than the bare id: `session_id` is
 *  public in every `PublishComment` payload, so the id alone cannot be the credential or
 *  any reviewer could impersonate another from a comment listing. */
export async function sessionCookieValue(sessionId: string, secret: string): Promise<string> {
  return `${sessionId}.${await tagFor(sessionId, secret)}`
}

export async function sessionIdFromCookie(
  cookie: string,
  secret: string,
): Promise<string | null> {
  const separator = cookie.lastIndexOf(".")
  if (separator <= 0) return null
  const sessionId = cookie.slice(0, separator)
  const tag = cookie.slice(separator + 1)
  return constantTimeEqual(tag, await tagFor(sessionId, secret)) ? sessionId : null
}

const PIN_SCHEME = "pbkdf2-sha256"

const PIN_ITERATIONS = 100_000

const PIN_SALT_BYTES = 16

const PIN_HASH_BITS = 256

async function derivePin(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    PIN_HASH_BITS,
  )
  return base64url(new Uint8Array(bits))
}

function decodeBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Packed as `pbkdf2-sha256$<iterations>$<salt>$<hash>` in one `sessions.pin` column — see
 *  `migrations/0002_session_pin.sql` for why the storage is one column and not four. */
export async function hashPin(pin: string): Promise<string> {
  const salt = new Uint8Array(PIN_SALT_BYTES)
  crypto.getRandomValues(salt)
  const hash = await derivePin(pin, salt, PIN_ITERATIONS)
  return `${PIN_SCHEME}$${PIN_ITERATIONS}$${base64url(salt)}$${hash}`
}

/** Trim + upper-case on both sides of the comparison: the code travels by voice and by
 *  handwriting before it is typed, so case is not part of the secret. */
export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function hashAccessCode(code: string): Promise<string> {
  return hashPin(normalizeAccessCode(code))
}

export async function verifyAccessCode(code: string, packed: string | null): Promise<boolean> {
  return verifyPin(normalizeAccessCode(code), packed)
}

/** The grant is keyed over the *stored hash*, whose salt is regenerated on every set, so
 *  rotating (or removing, or re-setting to the same string) the code changes the expected tag
 *  and every cookie minted for the previous code stops verifying. No revocation list, no extra
 *  column: invalidation is mostly a property of the hash the cookie was signed against — the
 *  `issuedAt` embedded in the tag below adds the one thing that alone cannot give it, an expiry
 *  the server itself enforces regardless of whether the code ever changes. */
async function accessTag(
  token: string,
  packed: string,
  secret: string,
  issuedAtSeconds: number,
): Promise<string> {
  return tagFor(`access:${token}:${packed}:${issuedAtSeconds}`, secret)
}

/** `<issuedAtSeconds>.<tag>` — the issued-at rides in the cookie, in the clear, the same way a
 *  JWT's claims do: it only has to be tamper-evident, not secret, since the tag covers it and a
 *  forged one simply fails to verify. A cookie minted before this shape existed is a bare tag
 *  with no `.` in it, which the parser below refuses outright: a stale grant does not get
 *  reinterpreted as one issued at time zero, it just stops working and the reader re-enters the
 *  code once. */
export async function accessCookieValue(
  token: string,
  packed: string,
  secret: string,
  issuedAt: Date = new Date(),
): Promise<string> {
  const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000)
  return `${issuedAtSeconds}.${await accessTag(token, packed, secret, issuedAtSeconds)}`
}

export async function accessCookieIsValid(
  cookie: string | undefined,
  token: string,
  packed: string,
  secret: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (cookie === undefined) return false

  const separator = cookie.indexOf(".")
  if (separator <= 0) return false

  const issuedAtSeconds = Number(cookie.slice(0, separator))
  const tag = cookie.slice(separator + 1)
  if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds < 0) return false

  /** Checked ahead of the HMAC comparison purely to skip it once age alone is disqualifying —
   *  `issuedAt` travels in the clear (see `accessCookieValue`), so there is nothing timing could
   *  leak about it that the cookie itself does not already show. */
  const ageSeconds = Math.floor(now.getTime() / 1000) - issuedAtSeconds
  if (ageSeconds > PUBLICATION_ACCESS_MAX_AGE_SECONDS) return false

  return constantTimeEqual(tag, await accessTag(token, packed, secret, issuedAtSeconds))
}

/** Always derives, even for a session that has no PIN, so the answer time of a failed claim
 *  does not tell an attacker whether the name exists. */
export async function verifyPin(pin: string, packed: string | null): Promise<boolean> {
  const parts = (packed ?? "").split("$")
  const usable =
    parts.length === 4 &&
    parts[0] === PIN_SCHEME &&
    Number.isInteger(Number(parts[1])) &&
    Number(parts[1]) > 0
  const iterations = usable ? Number(parts[1]) : PIN_ITERATIONS
  const salt = usable ? decodeBase64url(parts[2] as string) : new Uint8Array(PIN_SALT_BYTES)
  const expected = usable ? (parts[3] as string) : ""

  const actual = await derivePin(pin, salt, iterations)
  return usable && constantTimeEqual(actual, expected)
}
