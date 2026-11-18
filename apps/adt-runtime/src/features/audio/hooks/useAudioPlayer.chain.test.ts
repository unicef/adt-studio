// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { nextChainIndex } from "./useAudioPlayer"

describe("nextChainIndex (SPEC-0014 AC-3)", () => {
  it("chains the read-aloud sweep to the next item", () => {
    expect(nextChainIndex(0, 3, true)).toBe(1)
    expect(nextChainIndex(1, 3, true)).toBe(2)
  })

  it("stops at the end of the sweep", () => {
    expect(nextChainIndex(2, 3, true)).toBeNull()
  })

  it("stops after one element when the play is per-element", () => {
    expect(nextChainIndex(0, 3, false)).toBeNull()
    expect(nextChainIndex(2, 3, false)).toBeNull()
  })
})
