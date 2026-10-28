import { describe, expect, it } from "vitest"
import { countGroups, groupPages } from "./groupPages"

describe("groupPages", () => {
  it("single mode yields one group per page", () => {
    expect(groupPages(1, 5, false)).toEqual([[1], [2], [3], [4], [5]])
  })

  it("spread mode keeps the first page solo then pairs sequentially", () => {
    expect(groupPages(1, 5, true)).toEqual([[1], [2, 3], [4, 5]])
  })

  it("spread mode leaves a trailing odd page standalone", () => {
    expect(groupPages(1, 4, true)).toEqual([[1], [2, 3], [4]])
  })

  it("spread mode with one or two pages keeps every page solo", () => {
    expect(groupPages(1, 1, true)).toEqual([[1]])
    expect(groupPages(1, 2, true)).toEqual([[1], [2]])
  })

  it("spread mode with six pages ends on a single", () => {
    expect(groupPages(1, 6, true)).toEqual([[1], [2, 3], [4, 5], [6]])
  })

  it("respects a start offset", () => {
    expect(groupPages(3, 8, true)).toEqual([[3], [4, 5], [6, 7], [8]])
    expect(groupPages(3, 7, false)).toEqual([[3], [4], [5], [6], [7]])
  })

  it("returns nothing for an empty range", () => {
    expect(groupPages(1, 0, true)).toEqual([])
    expect(groupPages(1, 0, false)).toEqual([])
  })

  it("matches computeGroups once 0-based half-open is mapped to 1-based inclusive", () => {
    const computeGroupsSpread: Array<[number, number, number[][]]> = [
      [0, 5, [[0], [1, 2], [3, 4]]],
      [0, 4, [[0], [1, 2], [3]]],
    ]
    for (const [start, end, groups] of computeGroupsSpread) {
      expect(groupPages(start + 1, end, true)).toEqual(groups.map((group) => group.map((index) => index + 1)))
    }
  })
})

describe("countGroups", () => {
  const cases: Array<[number, number]> = [
    [1, 1],
    [1, 2],
    [1, 5],
    [1, 6],
    [3, 8],
    [1, 0],
    [10, 20],
  ]

  it.each(cases)("equals groupPages(%i, %i).length in both modes", (start, end) => {
    expect(countGroups(start, end, true)).toBe(groupPages(start, end, true).length)
    expect(countGroups(start, end, false)).toBe(groupPages(start, end, false).length)
  })
})
