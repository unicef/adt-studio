import { describe, expect, it } from "vitest"
import { isSpreadPageId, measureRatios, parseStoredRatio, runRatio } from "./usePageAspect"

describe("page ratio memory", () => {
  it("tells merged spread ids from single pages", () => {
    expect(isSpreadPageId("pg004")).toBe(false)
    expect(isSpreadPageId("pg004005")).toBe(true)
  })

  it("keeps the single-page ratio when most pages are spreads", () => {
    const measured = measureRatios([
      { ratio: 0.75, spread: false },
      { ratio: 1.5, spread: true },
      { ratio: 1.5, spread: true },
    ])
    expect(measured).toEqual({ ratio: 1.5, single: 0.75 })
  })

  it("halves the spread ratio when no single page was measured", () => {
    expect(measureRatios([{ ratio: 1.6, spread: true }])).toEqual({ ratio: 1.6, single: 0.8 })
  })

  it("derives each mode's run ratio from the single-page ratio", () => {
    const stored = { ratio: 1.5, single: 0.75 }
    expect(runRatio(stored, false)).toBe(0.75)
    expect(runRatio(stored, true)).toBe(1.5)
    expect(runRatio(null, false)).toBe(0.75)
  })

  it("reads the stored value and the older bare-number format", () => {
    expect(parseStoredRatio(JSON.stringify({ ratio: 1.5, single: 0.75 }))).toEqual({ ratio: 1.5, single: 0.75 })
    expect(parseStoredRatio("0.7")).toEqual({ ratio: 0.7, single: 0.7 })
    expect(parseStoredRatio("nonsense")).toBeNull()
    expect(parseStoredRatio(null)).toBeNull()
  })
})
