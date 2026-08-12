import { describe, expect, it } from "vitest"
import { moveReadingOrderItem, moveReadingOrderRow } from "./use-reading-order"
import type { ReadingOrderEntry } from "@/api/client"

function order(ids: string): ReadingOrderEntry[] {
  return ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => ({ kind: "section", id }))
}

function ids(entries: readonly ReadingOrderEntry[]): string {
  return entries.map((e) => e.id).join(" ")
}

describe("moveReadingOrderItem", () => {
  it("moves an item earlier", () => {
    expect(ids(moveReadingOrderItem(order("a b c d"), "c", 1))).toBe("a c b d")
  })

  it("moves an item later, accounting for the gap it leaves behind", () => {
    // Dropping "a" before "d" (index 3) must land it *after* "c": removing "a"
    // first shifts everything down one, so the raw index would overshoot.
    expect(ids(moveReadingOrderItem(order("a b c d"), "a", 3))).toBe("b c a d")
  })

  it("moves an item to the very end", () => {
    expect(ids(moveReadingOrderItem(order("a b c"), "a", 3))).toBe("b c a")
  })

  it("moves an item to the very front", () => {
    expect(ids(moveReadingOrderItem(order("a b c"), "c", 0))).toBe("c a b")
  })

  it("is a no-op when the item lands where it already is", () => {
    expect(ids(moveReadingOrderItem(order("a b c"), "b", 1))).toBe("a b c")
    expect(ids(moveReadingOrderItem(order("a b c"), "b", 2))).toBe("a b c")
  })

  it("returns a copy when the id is not present", () => {
    const input = order("a b")
    const result = moveReadingOrderItem(input, "zz", 0)
    expect(ids(result)).toBe("a b")
    expect(result).not.toBe(input)
  })

  it("keeps every item exactly once", () => {
    const input = order("a b c d e")
    for (const target of [0, 1, 2, 3, 4, 5]) {
      const result = moveReadingOrderItem(input, "c", target)
      expect([...result].map((e) => e.id).sort()).toEqual(["a", "b", "c", "d", "e"])
    }
  })
})

describe("moveReadingOrderRow", () => {
  const rows = (list: string) => list.split(/\s+/).filter(Boolean)

  function move(orderIds: string, rowIds: string, id: string, delta: number): string | null {
    const result = moveReadingOrderRow(order(orderIds), rows(rowIds), id, delta)
    return result === null ? null : ids(result)
  }

  it("steps a row down past its neighbour", () => {
    expect(move("a b c", "a b c", "a", 1)).toBe("b a c")
  })

  it("steps a row up past its neighbour", () => {
    expect(move("a b c", "a b c", "c", -1)).toBe("a c b")
  })

  it("is a no-op at either end", () => {
    expect(move("a b c", "a b c", "a", -1)).toBeNull()
    expect(move("a b c", "a b c", "c", 1)).toBeNull()
  })

  it("is a no-op for a row the list does not show", () => {
    expect(move("a b c", "a b", "c", -1)).toBeNull()
  })

  // The two lists differ whenever a screen cannot resolve every slot — a quiz
  // row in the sections-only overview, say. A step must then cross the whole
  // gap in one go rather than landing the row in a slot the user cannot see,
  // which would look like the move did nothing.
  it("steps over slots the displayed list skips", () => {
    expect(move("a hidden b", "a b", "a", 1)).toBe("hidden b a")
    expect(move("a hidden b", "a b", "b", -1)).toBe("b a hidden")
  })

  it("keeps every slot exactly once, including the skipped ones", () => {
    const result = moveReadingOrderRow(order("a x b y c"), rows("a b c"), "a", 1)
    expect([...result!].map((e) => e.id).sort()).toEqual(["a", "b", "c", "x", "y"])
  })
})
