import { describe, expect, it } from "vitest"
import { reconcileReadingOrder } from "../reading-order.js"
import type { ReadingOrderItem } from "@adt/types"

/** `"a b c"` → section items, for readable expectations. */
function order(ids: string): ReadingOrderItem[] {
  return ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => ({ kind: id.startsWith("qz") ? "quiz" : "section", id }) as ReadingOrderItem)
}

function ids(items: readonly ReadingOrderItem[]): string {
  return items.map((item) => item.id).join(" ")
}

describe("reconcileReadingOrder", () => {
  it("uses the default order when nothing is stored", () => {
    const result = reconcileReadingOrder(null, order("a b c"))
    expect(ids(result.items)).toBe("a b c")
    expect(result.changed).toBe(false)
  })

  it("keeps a stored order that still matches the book", () => {
    const result = reconcileReadingOrder(order("c a b"), order("a b c"))
    expect(ids(result.items)).toBe("c a b")
    expect(result.changed).toBe(false)
  })

  it("drops stored ids the book no longer has", () => {
    const result = reconcileReadingOrder(order("c a b"), order("a c"))
    expect(ids(result.items)).toBe("c a")
    expect(ids(result.dropped)).toBe("b")
    expect(result.changed).toBe(true)
  })

  it("inserts a new id after the sibling it was created next to", () => {
    // A clone/split lands immediately after its original in the default order,
    // so it lands immediately after it in the user's order too — no
    // reading-order code needed in the clone or split endpoints.
    const result = reconcileReadingOrder(order("c a b"), order("a a2 b c"))
    expect(ids(result.items)).toBe("c a a2 b")
    expect(result.added).toEqual([{ item: { kind: "section", id: "a2" }, afterId: "a" }])
  })

  it("inserts at the front when nothing precedes the newcomer", () => {
    const result = reconcileReadingOrder(order("c a"), order("z a c"))
    expect(ids(result.items)).toBe("z c a")
    expect(result.added[0].afterId).toBeNull()
  })

  it("keeps several newcomers in the same gap in their default order", () => {
    const result = reconcileReadingOrder(order("b a"), order("a a2 a3 b"))
    expect(ids(result.items)).toBe("b a a2 a3")
  })

  it("follows its default-order sibling even when that sibling was moved", () => {
    // Stored order moved `b` ahead of `a`; `z` is new and sits after `b` in the
    // default order, so it lands after `b` — not at the end of the book.
    //
    // This is the deliberate trade-off in rule 3. A section cloned from `b`
    // and a brand-new page appended after `b` look identical here, and for the
    // clone, staying beside its original matters far more than sitting last.
    // Both cases are served by following the sibling.
    const result = reconcileReadingOrder(order("b a"), order("a b z"))
    expect(ids(result.items)).toBe("b z a")
    expect(result.added[0].afterId).toBe("b")
  })

  it("keeps a clone next to its original wherever the original was moved to", () => {
    // The concrete case rule 3 exists for: cloning `b` while `b` sits first.
    const result = reconcileReadingOrder(order("b a"), order("a b b2"))
    expect(ids(result.items)).toBe("b b2 a")
  })

  it("keeps the first occurrence when the stored order repeats an id", () => {
    const result = reconcileReadingOrder(order("a b a"), order("a b"))
    expect(ids(result.items)).toBe("a b")
    expect(result.changed).toBe(true)
  })

  it("is idempotent", () => {
    const defaults = order("a a2 b c z")
    const once = reconcileReadingOrder(order("c a b"), defaults)
    const twice = reconcileReadingOrder(once.items, defaults)

    expect(ids(twice.items)).toBe(ids(once.items))
    expect(twice.changed).toBe(false)
    expect(twice.added).toEqual([])
    expect(twice.dropped).toEqual([])
  })

  it("preserves a custom order across a sectioning re-run that keeps the same ids", () => {
    // Same section count ⇒ same id set ⇒ the user's arrangement survives whole.
    const custom = order("pg002_sec001 pg001_sec001 pg001_sec002")
    const result = reconcileReadingOrder(custom, order("pg001_sec001 pg001_sec002 pg002_sec001"))
    expect(ids(result.items)).toBe(ids(custom))
    expect(result.changed).toBe(false)
  })

  it("places a newly added quiz at its anchor rather than at the end", () => {
    const result = reconcileReadingOrder(
      order("pg002_sec001 pg001_sec001"),
      order("pg001_sec001 qz001 pg002_sec001"),
    )
    expect(ids(result.items)).toBe("pg002_sec001 pg001_sec001 qz001")
    expect(result.added[0]).toEqual({ item: { kind: "quiz", id: "qz001" }, afterId: "pg001_sec001" })
  })
})
