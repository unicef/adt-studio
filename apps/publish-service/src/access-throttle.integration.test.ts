import { beforeEach, describe, expect, it } from "vitest"
import {
  attemptGate,
  callerIp,
  clientHandle,
  CLIENT_ATTEMPT_LIMIT,
  cooldownFor,
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
