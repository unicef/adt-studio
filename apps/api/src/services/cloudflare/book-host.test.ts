import { describe, expect, it } from "vitest"
import { PublicationToken } from "@adt/types"
import {
  BOOK_WORKER_NAME_PREFIX,
  MAX_WORKERS_DEV_NAME_LENGTH,
  bookWorkerName,
  isLegalWorkerName,
} from "./book-host.js"

/** The shapes a base64url token can actually take, each chosen for the Cloudflare naming rule
 *  it would break if the token were used in the name directly. */
const TOKENS = {
  typical: "8Kd2mXqR7vLpNwZaBcYtEfGh",
  underscore: "8Kd2mXqR7v_pNwZaBcYtEfGh",
  leadingDash: "-Kd2mXqR7vLpNwZaBcYtEfGh",
  trailingDash: "8Kd2mXqR7vLpNwZaBcYtEfG-",
  longest: "a".repeat(64),
  shortest: "a".repeat(22),
}

describe("book worker naming", () => {
  it("accepts every fixture as a real publication token", () => {
    for (const token of Object.values(TOKENS)) {
      expect(PublicationToken.safeParse(token).success).toBe(true)
    }
  })

  it("derives a name Cloudflare will accept from any legal token", () => {
    for (const [shape, token] of Object.entries(TOKENS)) {
      const name = bookWorkerName(token)
      expect(isLegalWorkerName(name), `${shape} produced ${name}`).toBe(true)
      expect(name.length).toBe(41)
    }
  })

  /** The reason this module exists: the obvious `adt-book-<token>` is illegal three ways, and
   *  each way is silent until Cloudflare rejects the deploy. */
  it("would produce an illegal name if the token were used directly", () => {
    expect(isLegalWorkerName(`${BOOK_WORKER_NAME_PREFIX}${TOKENS.underscore}`)).toBe(false)
    expect(isLegalWorkerName(`${BOOK_WORKER_NAME_PREFIX}${TOKENS.trailingDash}`)).toBe(false)
    expect(`${BOOK_WORKER_NAME_PREFIX}${TOKENS.longest}`.length)
      .toBeGreaterThan(MAX_WORKERS_DEV_NAME_LENGTH)
  })

  it("is stable for a token and distinct between tokens", () => {
    expect(bookWorkerName(TOKENS.typical)).toBe(bookWorkerName(TOKENS.typical))

    const names = Object.values(TOKENS).map(bookWorkerName)
    expect(new Set(names).size).toBe(names.length)
  })

  /** base64url is case-sensitive and these are two different publications, so the names must
   *  not collapse into one — which a lowercasing scheme rather than a digest would do. */
  it("separates tokens that differ only by case", () => {
    expect(bookWorkerName("aKd2mXqR7vLpNwZaBcYtEfGh"))
      .not.toBe(bookWorkerName("AKd2mXqR7vLpNwZaBcYtEfGh"))
  })
})
