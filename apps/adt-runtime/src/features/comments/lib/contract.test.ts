import { describe, expect, it } from "vitest"
import {
  COMMENTER_NAME_MAX_LENGTH as SHARED_NAME_MAX,
  COMMENTER_PIN_MAX_LENGTH as SHARED_PIN_MAX,
  COMMENTER_PIN_MIN_LENGTH as SHARED_PIN_MIN,
  PUBLISH_COMMENT_BODY_MAX_LENGTH as SHARED_BODY_MAX,
} from "@adt/types"
import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENTER_NAME_MAX_LENGTH,
  COMMENTER_PIN_MAX_LENGTH,
  COMMENTER_PIN_MIN_LENGTH,
} from "./contract"

/**
 * The runtime restates these caps instead of importing the values, because a
 * value import from @adt/types would pull zod into every published book. This
 * test is what keeps the restatement honest — tests are not bundled, so it can
 * import the real thing.
 */
describe("comment contract caps", () => {
  it("matches @adt/types", () => {
    expect(COMMENT_BODY_MAX_LENGTH).toBe(SHARED_BODY_MAX)
    expect(COMMENTER_NAME_MAX_LENGTH).toBe(SHARED_NAME_MAX)
  })

  it("keeps the PIN input inside the contract's range", () => {
    expect(COMMENTER_PIN_MIN_LENGTH).toBeGreaterThanOrEqual(SHARED_PIN_MIN)
    expect(COMMENTER_PIN_MAX_LENGTH).toBeLessThanOrEqual(SHARED_PIN_MAX)
    expect(COMMENTER_PIN_MIN_LENGTH).toBeLessThanOrEqual(COMMENTER_PIN_MAX_LENGTH)
  })
})
