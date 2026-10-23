import { describe, expect, it } from "vitest"
import { nextRovingIndex } from "./useRovingFocus"

describe("nextRovingIndex", () => {
  it("moves with the arrows and wraps around", () => {
    expect(nextRovingIndex("ArrowRight", 0, 4)).toBe(1)
    expect(nextRovingIndex("ArrowRight", 3, 4)).toBe(0)
    expect(nextRovingIndex("ArrowLeft", 0, 4)).toBe(3)
  })

  it("jumps to the ends with Home and End", () => {
    expect(nextRovingIndex("Home", 2, 4)).toBe(0)
    expect(nextRovingIndex("End", 0, 4)).toBe(3)
  })

  it("ignores other keys and empty toolbars", () => {
    expect(nextRovingIndex("ArrowDown", 0, 4)).toBeNull()
    expect(nextRovingIndex("ArrowRight", 0, 0)).toBeNull()
  })
})
