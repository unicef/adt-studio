import { describe, expect, it } from "vitest"
import { scopeItemsToPages } from "./scopeItemsToPages"

const pages = [{ pageId: "p1" }, { pageId: "p2" }, { pageId: "p3" }]

describe("scopeItemsToPages", () => {
  const items = [
    { id: "a", on: ["p3", "p1"] },
    { id: "b", on: ["p3"] },
    { id: "c", on: [] },
    { id: "d", on: ["p1", "p1"] },
  ]
  const scoped = scopeItemsToPages(pages, items, (item) => item.on)

  it("keeps only pages with items, in book order", () => {
    expect(scoped.navPages.map((page) => page.pageId)).toEqual(["p1", "p3"])
  })

  it("lists each item once per page it belongs to", () => {
    expect(scoped.itemsOn("p1").map((item) => item.id)).toEqual(["a", "d"])
    expect(scoped.itemsOn("p3").map((item) => item.id)).toEqual(["a", "b"])
    expect(scoped.countOn("p1")).toBe(2)
  })

  it("has nothing for pages without items", () => {
    expect(scoped.itemsOn("p2")).toEqual([])
    expect(scoped.countOn("p2")).toBe(0)
  })
})
