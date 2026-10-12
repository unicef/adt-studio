import { describe, expect, it } from "vitest"
import { READING_ORDER_BLOCKING_STEPS } from "@adt/types"
import {
  blockingReadingOrderStep,
  moveReadingOrderItem,
  moveReadingOrderRow,
  rebaseReadingOrderDraft,
} from "./use-reading-order"
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

  // A step down onto the last displayed row has no row after it to anchor to.
  // It must still land immediately after that row, not at the end of the stored
  // order — a slot trailing the last visible row (an end-of-book quiz, say)
  // belongs after the row that moved, and jumping it would reorder the book
  // in a way the table that made the move cannot show.
  it("does not overshoot slots trailing the last displayed row", () => {
    expect(move("a b trailing", "a b", "a", 1)).toBe("b a trailing")
  })

  it("is a no-op stepping the last displayed row down over a trailing slot", () => {
    expect(move("a b trailing", "a b", "b", 1)).toBeNull()
  })

  it("keeps every slot exactly once, including the skipped ones", () => {
    const result = moveReadingOrderRow(order("a x b y c"), rows("a b c"), "a", 1)
    expect([...result!].map((e) => e.id).sort()).toEqual(["a", "b", "c", "x", "y"])
  })
})

describe("rebaseReadingOrderDraft", () => {
  const rebase = (draftIds: string, orderIds: string) => {
    const result = rebaseReadingOrderDraft(order(draftIds), order(orderIds))
    return result === null ? null : ids(result)
  }

  it("leaves an arrangement alone when the book has not changed under it", () => {
    expect(rebase("c a b", "a b c")).toBeNull()
  })

  // A clone or split writes straight to the server, so the pending arrangement
  // is suddenly a list of the book's *old* slots. Saving it as-is is refused —
  // the PUT demands an exact permutation — and no amount of dragging fixes it.
  it("takes in a slot the book gained, next to where the server put it", () => {
    expect(rebase("c a b", "a a2 b c")).toBe("c a a2 b")
  })

  it("puts a new first slot at the front", () => {
    expect(rebase("c a b", "z a b c")).toBe("z c a b")
  })

  it("keeps two new neighbours in the order the server gave them", () => {
    expect(rebase("b a", "a a2 a3 b")).toBe("b a a2 a3")
  })

  it("lets go of a slot the book no longer has", () => {
    expect(rebase("c a b", "a c")).toBe("c a")
  })

  it("handles a slot arriving and another leaving at once", () => {
    expect(rebase("c a b", "a a2 c")).toBe("c a a2")
  })

  it("preserves the user's arrangement rather than the server's", () => {
    // The whole point: the server's order is only consulted for *membership*
    // and for where to seat what is new.
    expect(rebase("c b a", "a b c")).toBeNull()
  })

  it("seats a new slot beside the slot it follows, not at the end", () => {
    // `d` follows `c` on the server, and a clone is the case that matters: the
    // copy belongs next to its original wherever the user has since moved it,
    // not marooned at the end of the book.
    expect(rebase("c b a", "a b c d")).toBe("c d b a")
  })
})

describe("blockingReadingOrderStep", () => {
  const running =
    (...steps: string[]) =>
    (step: string) =>
      steps.includes(step) ? ("running" as const) : ("idle" as const)

  it("names the running step the server would refuse the save for", () => {
    // The set itself lives in @adt/types and is what the API's guard reads, so
    // asserting against its members keeps the two ends provably in step.
    for (const step of READING_ORDER_BLOCKING_STEPS) {
      expect(blockingReadingOrderStep(running(step))).toBe(step)
    }
  })

  it("allows rearranging during a step that cannot move anything", () => {
    // Captions, glossary, translation, speech and packaging only add material
    // to pages that already have their place — the server lets these through.
    expect(blockingReadingOrderStep(running("image-captioning"))).toBeNull()
    expect(blockingReadingOrderStep(running("glossary"))).toBeNull()
    expect(blockingReadingOrderStep(running("tts"))).toBeNull()
    expect(blockingReadingOrderStep(running("package-web"))).toBeNull()
  })

  it("allows rearranging when nothing is running", () => {
    expect(blockingReadingOrderStep(running())).toBeNull()
  })

  it("does not block on a blocking step that has already finished", () => {
    expect(blockingReadingOrderStep(() => "done")).toBeNull()
    expect(blockingReadingOrderStep(() => "error")).toBeNull()
  })
})
