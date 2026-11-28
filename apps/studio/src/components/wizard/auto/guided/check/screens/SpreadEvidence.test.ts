import { describe, expect, it } from "vitest"
import { openings } from "./SpreadEvidence"

describe("openings", () => {
  it("puts facing pages together and leaves the rest alone", () => {
    expect(openings([13, 8, 9, 12, 20])).toEqual([[8, 9], [12, 13], [20]])
  })

  it("never pairs wide pages: each already holds two pages", () => {
    expect(openings([2, 3, 4], true)).toEqual([[2], [3], [4]])
  })
})
