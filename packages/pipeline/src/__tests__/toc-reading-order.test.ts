import { describe, expect, it } from "vitest"
import type { TocEntry } from "@adt/types"
import { orderTocEntries } from "../toc-reading-order.js"
import { nestTocEntries } from "../packaging/webpub.js"

const entry = (id: string, level = 1, sectionId = id): TocEntry => ({
  id, title: id, sectionId, href: id, chapterId: "", level,
})
const positions = new Map([["a", 1], ["b", 2], ["c", 3], ["d", 4]])
const titles = (entries: TocEntry[]) => entries.map((e) => e.title)

describe("orderTocEntries", () => {
  it("sorts flat entries stably, including duplicate destinations and unmatched entries", () => {
    const entries = [entry("unknown1"), entry("c"), entry("first-a", 1, "a"), entry("second-a", 1, "a"), entry("unknown2")]
    const snapshot = structuredClone(entries)
    expect(titles(orderTocEntries(entries, positions))).toEqual(["first-a", "second-a", "c", "unknown1", "unknown2"])
    expect(entries).toEqual(snapshot)
    expect(orderTocEntries([], positions)).toEqual([])
    expect(orderTocEntries(entries, new Map())).toEqual(entries)
  })

  it("moves unlinked parents with their children and orders siblings within each group", () => {
    const ordered = orderTocEntries([
      entry("Unit two", 1, ""), entry("d", 2), entry("c", 2),
      entry("Unit one", 1, ""), entry("b", 2), entry("a", 2),
    ], positions)
    expect(titles(ordered)).toEqual(["Unit one", "a", "b", "Unit two", "c", "d"])
    expect(nestTocEntries(ordered)).toEqual([
      { title: "Unit one", href: "Unit one", children: [{ title: "a", href: "a" }, { title: "b", href: "b" }] },
      { title: "Unit two", href: "Unit two", children: [{ title: "c", href: "c" }, { title: "d", href: "d" }] },
    ])
  })

  it("keeps pruned parents, deeply nested descendants, and wholly unmatched groups intact", () => {
    const ordered = orderTocEntries([
      entry("unmatched"), entry("missing-child", 2),
      entry("c"), entry("pruned"), entry("subheading", 3, ""), entry("a", 6),
    ], positions)
    expect(titles(ordered)).toEqual(["pruned", "subheading", "a", "c", "unmatched", "missing-child"])
    expect(ordered.map((e) => e.level)).toEqual([1, 3, 6, 1, 1, 2])
  })

  it("does not accidentally reparent siblings with different heading levels", () => {
    const entries = [entry("c", 3), entry("a", 1), entry("d", 4), entry("b", 2)]
    const ordered = orderTocEntries(entries, positions)
    expect(ordered).toEqual(entries)
    expect(nestTocEntries(ordered)).toEqual([
      { title: "c", href: "c" },
      { title: "a", href: "a", children: [{ title: "d", href: "d" }, { title: "b", href: "b" }] },
    ])
  })

  it("prioritizes a saved parent-child relationship when their links point backwards", () => {
    const ordered = orderTocEntries([entry("c"), entry("d"), entry("a", 2)], positions)
    expect(titles(ordered)).toEqual(["d", "a", "c"])
    expect(nestTocEntries(ordered)[0]).toEqual({ title: "d", href: "d", children: [{ title: "a", href: "a" }] })
    expect(orderTocEntries(ordered, positions)).toEqual(ordered)
  })
  it("preserves the downstream hierarchy for arbitrary valid heading-level gaps", () => {
    const levels = [1, 2, 4, 6]
    const parents = (toc: TocEntry[]) => {
      const edges: string[] = []
      const walk = (links: ReturnType<typeof nestTocEntries>, parent = "root") => {
        for (const link of links) {
          edges.push(`${link.href}:${parent}`)
          walk(link.children ?? [], link.href)
        }
      }
      walk(nestTocEntries(toc))
      return edges.sort()
    }
    for (const a of levels) for (const b of levels) for (const c of levels) for (const d of levels) {
      const entries = [a, b, c, d].map((level, i) => entry(String(i), level))
      const reversed = new Map(entries.map((e, i) => [e.sectionId, 4 - i]))
      const ordered = orderTocEntries(entries, reversed)
      expect(parents(ordered)).toEqual(parents(entries))
      expect(orderTocEntries(ordered, reversed)).toEqual(ordered)
      expect(ordered.map((e) => e.id).sort()).toEqual(["0", "1", "2", "3"])
    }
  })

})
