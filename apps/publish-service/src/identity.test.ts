import { describe, expect, it } from "vitest"
import { PUBLICATION_ACCESS_MAX_AGE_SECONDS } from "@adt/types"
import { accessCookieIsValid, accessCookieValue, hmacTag } from "./identity.js"

const SECRET = "local-dev-secret"
const TOKEN = "identityTokenAbcdefghijklmnopqr"
const PACKED = "pbkdf2-sha256$100000$c2FsdA$aGFzaGVk"

describe("access grant cookie", () => {
  it("round-trips a freshly issued cookie", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z")
    const cookie = await accessCookieValue(TOKEN, PACKED, SECRET, issuedAt)
    expect(await accessCookieIsValid(cookie, TOKEN, PACKED, SECRET, issuedAt)).toBe(true)
  })

  /** The whole point of embedding `issuedAt`: a grant that would have verified forever under
   *  the old static-tag cookie must stop working once it is old enough, with no revocation list
   *  and no change to the access code required. */
  it("rejects a cookie older than the max age, and accepts one exactly at the boundary", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z")
    const cookie = await accessCookieValue(TOKEN, PACKED, SECRET, issuedAt)

    const atLimit = new Date(issuedAt.getTime() + PUBLICATION_ACCESS_MAX_AGE_SECONDS * 1000)
    const pastLimit = new Date(atLimit.getTime() + 1000)

    expect(await accessCookieIsValid(cookie, TOKEN, PACKED, SECRET, atLimit)).toBe(true)
    expect(await accessCookieIsValid(cookie, TOKEN, PACKED, SECRET, pastLimit)).toBe(false)
  })

  /** Old-format cookies — a bare HMAC tag with no `.` in it, everything this worker minted
   *  before the issued-at prefix existed — must fail closed rather than being reinterpreted as
   *  issued at time zero: a reader carrying one simply re-enters the code once. */
  it("rejects an old-format cookie with no embedded issued-at", async () => {
    const bareTag = await hmacTag(`access:${TOKEN}:${PACKED}`, SECRET)
    expect(bareTag.includes(".")).toBe(false)
    expect(await accessCookieIsValid(bareTag, TOKEN, PACKED, SECRET, new Date())).toBe(false)
  })

  it("rejects structurally broken cookies without throwing", async () => {
    const now = new Date()
    for (const broken of ["", ".", "notanumber.tag", "-5.tag", "  .tag"]) {
      expect(await accessCookieIsValid(broken, TOKEN, PACKED, SECRET, now), broken).toBe(false)
    }
  })

  it("rejects a missing cookie, a wrong token, and a wrong packed hash", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z")
    const cookie = await accessCookieValue(TOKEN, PACKED, SECRET, issuedAt)

    expect(await accessCookieIsValid(undefined, TOKEN, PACKED, SECRET, issuedAt)).toBe(false)
    expect(
      await accessCookieIsValid(cookie, "anotherTokenAbcdefghijklmnopqrs", PACKED, SECRET, issuedAt),
    ).toBe(false)
    expect(await accessCookieIsValid(cookie, TOKEN, "different-packed-hash", SECRET, issuedAt)).toBe(
      false,
    )
    expect(await accessCookieIsValid(cookie, TOKEN, PACKED, "different-secret", issuedAt)).toBe(false)
  })

  /** Rotating the code (a fresh salt, so a new `packed`) retires every cookie minted for the old
   *  one, independent of the age check — the two invalidation paths are orthogonal. */
  it("stops verifying once the packed hash it was signed against changes", async () => {
    const issuedAt = new Date()
    const cookie = await accessCookieValue(TOKEN, PACKED, SECRET, issuedAt)
    const rotated = "pbkdf2-sha256$100000$bmV3c2FsdA$bmV3aGFzaA"
    expect(await accessCookieIsValid(cookie, TOKEN, rotated, SECRET, issuedAt)).toBe(false)
  })
})
