import { describe, expect, it } from "vitest"
import { moveReadingOrderItem } from "./use-reading-order"
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
