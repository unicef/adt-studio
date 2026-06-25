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

  it("never splits a two-page spread in spreadMode (odd start, even end)", () => {
    const w = computeEqualWindows(20, 3, { spreadMode: true })
    // 10 spreads / 3 → 4, 3, 3 spreads → pages [1-8], [9-14], [15-20]
    expect(w).toEqual([
      { startPage: 1, endPage: 8 },
      { startPage: 9, endPage: 14 },
      { startPage: 15, endPage: 20 },
    ])
    for (const r of w) {
      expect(r.startPage % 2).toBe(1) // every window starts on an odd page
      expect(r.endPage % 2).toBe(0) // and ends on an even page
    }
  })

  it("clamps the last spread window to an odd page count", () => {
    // 19 pages, spreadMode → 10 spreads, last spread is the lone page 19.
    const w = computeEqualWindows(19, 2, { spreadMode: true })
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
