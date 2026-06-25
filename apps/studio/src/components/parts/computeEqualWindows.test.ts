import { describe, expect, it } from "vitest"
import { computeEqualWindows } from "./parts-utils"

describe("computeEqualWindows", () => {
  it("splits evenly when divisible", () => {
    expect(computeEqualWindows(50, 5)).toEqual([
      { startPage: 1, endPage: 10 },
      { startPage: 11, endPage: 20 },
      { startPage: 21, endPage: 30 },
      { startPage: 31, endPage: 40 },
      { startPage: 41, endPage: 50 },
    ])
  })

  it("distributes the remainder to the earliest windows (sizes differ by ≤1)", () => {
    const w = computeEqualWindows(50, 4)
    // 50 / 4 → sizes 13, 13, 12, 12
    expect(w).toEqual([
      { startPage: 1, endPage: 13 },
      { startPage: 14, endPage: 26 },
      { startPage: 27, endPage: 38 },
      { startPage: 39, endPage: 50 },
    ])
    // Contiguous, covers 1..50, no gaps or overlaps.
    expect(w[0].startPage).toBe(1)
    expect(w[w.length - 1].endPage).toBe(50)
  })

  it("is contiguous and gapless for an arbitrary count", () => {
    const w = computeEqualWindows(19, 3)
    // 19 / 3 → sizes 7, 6, 6
    expect(w.map((r) => [r.startPage, r.endPage])).toEqual([
      [1, 7],
      [8, 13],
      [14, 19],
    ])
  })

  it("never splits a spread in spreadMode (page 1 standalone, then (2,3),(4,5)…)", () => {
    const w = computeEqualWindows(20, 3, { spreadMode: true })
    // 11 spread units (cover + 10 pairs) / 3 → 4, 4, 3 units
    expect(w).toEqual([
      { startPage: 1, endPage: 7 },
      { startPage: 8, endPage: 15 },
      { startPage: 16, endPage: 20 },
    ])
    for (const r of w) {
      // Every window starts on page 1 or an even page (the start of a spread)…
      expect(r.startPage === 1 || r.startPage % 2 === 0).toBe(true)
      // …and ends on an odd page (end of a spread) or the last page.
      expect(r.endPage % 2 === 1 || r.endPage === 20).toBe(true)
    }
  })

  it("clamps the last spread window to the final page", () => {
    // 19 pages, spreadMode → cover + 9 pairs = 10 units → 5, 5.
    const w = computeEqualWindows(19, 2, { spreadMode: true })
    expect(w).toEqual([
      { startPage: 1, endPage: 9 },
      { startPage: 10, endPage: 19 },
    ])
    expect(w[w.length - 1].endPage).toBe(19)
  })

  it("caps parts at pageCount and returns [] for degenerate input", () => {
    expect(computeEqualWindows(3, 10)).toEqual([
      { startPage: 1, endPage: 1 },
      { startPage: 2, endPage: 2 },
      { startPage: 3, endPage: 3 },
    ])
    expect(computeEqualWindows(0, 4)).toEqual([])
    expect(computeEqualWindows(10, 0)).toEqual([])
  })
})
