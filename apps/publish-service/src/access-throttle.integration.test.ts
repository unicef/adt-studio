import { beforeEach, describe, expect, it } from "vitest"
import {
  attemptGate,
  callerIp,
  callerNetwork,
  clientHandle,
  CLIENT_ATTEMPT_LIMIT,
  cooldownFor,
  throttleSecretFor,
} from "./access-throttle.js"
import { createTestStore, resetBindings } from "../test/fixtures.js"

beforeEach(resetBindings)

const SECRET = "local-dev-secret"
const IP = "203.0.113.1"
const TOKEN = "throttleTokenAbcdefghijklmnopqr"
const NOW = new Date("2026-01-01T00:00:00.000Z")

describe("attemptGate", () => {
  /**
   * The bug this closes: under the old check-then-record shape, `checkAttemptAllowed` read the
   * count *before* anything wrote a row for the attempt in progress, so two requests racing the
   * same caller could both read "9 failures, under the limit of 10" and both be allowed through
   * — only afterwards, once each had separately verified a wrong guess, would either write its
   * own row. Record-then-check makes that ordering impossible: this test seeds nine failures
   * directly (standing in for nine earlier, already-serialized guesses) and then calls
   * `attemptGate` twice in a row for what would be the tenth and eleventh — the two "racers".
   * Racer B's count already includes racer A's row, because A's insert is what B's own count
   * query reads, not a snapshot taken before A ran.
   */
  it("counts a racer's own attempt before it can be read by the next one", async () => {
    const store = createTestStore()
    const client = await clientHandle(IP, SECRET)
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT - 1; i += 1) {
      await store.recordAccessFailure({ token: TOKEN, client, kind: "access", at: NOW.toISOString() })
    }

    const racerA = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })
    expect(racerA.refusedFor).toBeNull()

    const racerB = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })
    expect(racerB.refusedFor).not.toBeNull()
  })

  /** A refused attempt used to cost nothing but the caller's patience: `checkAttemptAllowed`
   *  only ever read, so a caller who kept knocking after the limit tripped was refused every
   *  time with the exact same `Retry-After`, because nothing recorded that they had knocked
   *  again. Recording every attempt — refused ones included — gives `cooldownFor` a real,
   *  growing count to escalate from. */
  it("keeps doubling Retry-After the longer a caller knocks after the limit", async () => {
    const store = createTestStore()
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i += 1) {
      await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })
    }

    const first = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })
    const second = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })
    const third = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "access", now: NOW })

    expect(first.refusedFor).not.toBeNull()
    expect(second.refusedFor).not.toBeNull()
    expect(third.refusedFor).not.toBeNull()
    expect(second.refusedFor as number).toBeGreaterThan(first.refusedFor as number)
    expect(third.refusedFor as number).toBeGreaterThan(second.refusedFor as number)
  })

  /** A correct answer at one door must not touch the other's counter — see store.ts's
   *  `AccessAttemptKind` and migration 0006. */
  it("keeps the access-code and PIN counters apart", async () => {
    const store = createTestStore()
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i += 1) {
      await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "pin", now: NOW })
    }

    const accessAttempt = await attemptGate({
      store,
      secret: SECRET,
      ip: IP,
      token: TOKEN,
      kind: "access",
      now: NOW,
    })
    /** Ten PIN failures on record does not touch the access door's own, separate count. */
    expect(accessAttempt.refusedFor).toBeNull()
    await accessAttempt.recordSuccess()

    /** And the success above cleared only the access-kind row it just wrote — the ten PIN
     *  failures are exactly as they were. */
    const pinAttempt = await attemptGate({ store, secret: SECRET, ip: IP, token: TOKEN, kind: "pin", now: NOW })
    expect(pinAttempt.refusedFor).not.toBeNull()
  })
})

/** Counted in full, one caller's refused attempts filled the per-book bucket on their own and
 *  kept every other reader out, right answer or not, for as long as they kept knocking. */
describe("the per-book limit", () => {
  const gate = (store: ReturnType<typeof createTestStore>, ip: string) =>
    attemptGate({ store, secret: SECRET, ip, token: TOKEN, kind: "access", now: NOW })

  it("takes no more than the per-caller limit from any one caller", async () => {
    const store = createTestStore()
    for (let i = 0; i < 200; i += 1) await gate(store, IP)

    expect((await gate(store, IP)).refusedFor).not.toBeNull()
    expect((await gate(store, "198.51.100.9")).refusedFor).toBeNull()
  })

  it("still trips once enough separate callers have guessed", async () => {
    const store = createTestStore()
    for (let caller = 0; caller < 7; caller += 1) {
      for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i += 1) await gate(store, `198.51.100.${caller}`)
    }

    expect((await gate(store, "192.0.2.200")).refusedFor).not.toBeNull()
  })

  it("counts every address in one IPv6 /64 as the same caller", async () => {
    const store = createTestStore()
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i += 1) await gate(store, `2001:db8:1:2::${(i + 1).toString(16)}`)

    expect((await gate(store, "2001:db8:1:2:ffff:ffff:ffff:ffff")).refusedFor).not.toBeNull()
    expect((await gate(store, "2001:db8:1:3::1")).refusedFor).toBeNull()
  })
})

describe("callerNetwork", () => {
  it("keeps an IPv4 address whole", () => {
    expect(callerNetwork("203.0.113.1")).toBe("203.0.113.1")
    expect(callerNetwork("unknown")).toBe("unknown")
  })

  it("reduces an IPv6 address to its /64, however it is spelled", () => {
    const expected = "2001:db8:0:1::/64"
    expect(callerNetwork("2001:db8:0:1::1")).toBe(expected)
    expect(callerNetwork("2001:0DB8:0000:0001:aaaa:bbbb:cccc:dddd")).toBe(expected)
    expect(callerNetwork("2001:db8::1:0:0:0:1")).toBe(expected)
    expect(callerNetwork("2001:db8:0:1::")).toBe(expected)
    expect(callerNetwork("::1")).toBe("0:0:0:0::/64")
  })

  it("treats an IPv4-mapped address as the IPv4 address it carries, in either spelling", () => {
    expect(callerNetwork("::ffff:203.0.113.1")).toBe("203.0.113.1")
    expect(callerNetwork("::ffff:cb00:7101")).toBe("203.0.113.1")
  })

  it("drops a zone id", () => {
    expect(callerNetwork("fe80::1%eth0")).toBe("fe80:0:0:0::/64")
  })

  /** Everything unparseable used to fold into one `0:0:0:0::/64` bucket, so unrelated callers
   *  shared a limit; anything that is not an address is now counted as exactly what it is. */
  it("leaves anything that is not an IPv6 address as it is", () => {
    for (const raw of ["zzzz:yyyy::1", ":::", "1:2:3:4:5:6:7:8:9", "1::2::3", "1:2:3", "::ffff:300.0.0.1"]) {
      expect(callerNetwork(raw)).toBe(raw)
    }
  })
})

describe("cooldownFor", () => {
  it("doubles per failure past the limit, capped", () => {
    expect(cooldownFor(11, 10)).toBe(60)
    expect(cooldownFor(12, 10)).toBe(120)
    expect(cooldownFor(13, 10)).toBe(240)
    expect(cooldownFor(30, 10)).toBe(900)
  })
})

describe("callerIp", () => {
  /** `x-forwarded-for` is whatever the client puts on the wire unless something upstream
   *  strips it — trusting it as a fallback let a caller pick a fresh throttle bucket on every
   *  request and made the limit above enforce nothing. */
  it("trusts only cf-connecting-ip, never the client-controlled x-forwarded-for", () => {
    expect(callerIp(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("unknown")
    expect(
      callerIp(
        new Headers({ "cf-connecting-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe("198.51.100.2")
    expect(callerIp(new Headers())).toBe("unknown")
  })
})

/** Keyed with each Worker's own secret, every host that answered for a book was a fresh bucket,
 *  and the per-client limit multiplied by the number of hosts. */
describe("one counter per book, wherever its door is asked", () => {
  /** The same known answer the Studio's `bookHostAuthorSecret` test pins, so the two derivations
   *  can't drift apart unnoticed. */
  it("derives exactly the per-book secret the Studio deploys", async () => {
    expect(await throttleSecretFor({ MGMT_SECRET: "local-dev-secret" }, "bookHostRoundTripTokenAbcdefghi1")).toBe(
      "9f95c2d151e76df9e0c814d95f9b5901bb7039fdd462fef2f83bb56513d9f69e",
    )
  })

  it("keys the control plane and the book's own host with the same value", async () => {
    const onControlPlane = await throttleSecretFor({ MGMT_SECRET: SECRET }, TOKEN)
    const perBook = onControlPlane as string
    expect(perBook).not.toBe(SECRET)
    expect(await throttleSecretFor({ MGMT_SECRET: perBook, BOOK_TOKEN: TOKEN }, TOKEN)).toBe(perBook)
  })

  it("refuses a client that splits its guesses between the host and the control plane", async () => {
    const store = createTestStore()
    const controlPlane = (await throttleSecretFor({ MGMT_SECRET: SECRET }, TOKEN)) as string
    const host = (await throttleSecretFor({ MGMT_SECRET: controlPlane, BOOK_TOKEN: TOKEN }, TOKEN)) as string
    for (let i = 0; i < CLIENT_ATTEMPT_LIMIT; i += 1) {
      const secret = i % 2 === 0 ? controlPlane : host
      await attemptGate({ store, secret, ip: IP, token: TOKEN, kind: "access", now: NOW })
    }

    const next = await attemptGate({ store, secret: host, ip: IP, token: TOKEN, kind: "access", now: NOW })
    expect(next.refusedFor).not.toBeNull()
  })
})

