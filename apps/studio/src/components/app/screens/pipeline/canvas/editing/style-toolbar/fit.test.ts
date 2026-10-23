import { describe, expect, it } from "vitest"
import { fitToolbar, toolbarWidth, type FitItem } from "./fit"

const metrics = { padding: 3, gap: 2, separator: 11, more: 60 }

const items: FitItem[] = [
  { key: "size", width: 92, group: "type", priority: 1 },
  { key: "bold", width: 28, group: "type", priority: 2 },
  { key: "italic", width: 28, group: "type", priority: 6 },
  { key: "color", width: 28, group: "type", priority: 3 },
  { key: "align", width: 28, group: "layout", priority: 5 },
  { key: "delete", width: 28, group: "delete", priority: 9 },
]

describe("toolbarWidth", () => {
  it("adds padding, gaps, a separator per group change and one before More", () => {
    const sum = 92 + 28 * 5
    expect(toolbarWidth(items, metrics)).toBe(3 * 2 + 60 + sum + 2 * 6 + 11 * 3)
  })

  it("drops the trailing separator when there is no More slot", () => {
    const sum = 92 + 28 * 5
    expect(toolbarWidth(items, { ...metrics, more: 0 })).toBe(3 * 2 + sum + 2 * 6 + 11 * 2)
  })

  it("is only the More button when nothing is visible", () => {
    expect(toolbarWidth([], metrics)).toBe(66)
  })
})

describe("fitToolbar", () => {
  it("keeps everything when there is room", () => {
    const { visible, folded } = fitToolbar(items, 1000, metrics)
    expect(visible.map((item) => item.key)).toEqual(items.map((item) => item.key))
    expect(folded).toEqual([])
  })

  it("folds the lowest-priority controls first and keeps display order", () => {
    const full = toolbarWidth(items, metrics)
    const { visible, folded } = fitToolbar(items, full - 1, metrics)
    expect(folded.map((item) => item.key)).toEqual(["delete"])
    expect(visible.map((item) => item.key)).toEqual(["size", "bold", "italic", "color", "align"])

    const tighter = fitToolbar(items, toolbarWidth(visible, metrics) - 1, metrics)
    expect(tighter.folded.map((item) => item.key)).toEqual(["italic", "delete"])
    expect(tighter.visible.map((item) => item.key)).toEqual(["size", "bold", "color", "align"])
  })

  it("folds everything into More when there is no room at all", () => {
    const { visible, folded } = fitToolbar(items, 40, metrics)
    expect(visible).toEqual([])
    expect(folded).toHaveLength(items.length)
  })

  it("never exceeds the available width once something fits", () => {
    for (let available = 70; available < 500; available += 7) {
      const { visible } = fitToolbar(items, available, metrics)
      expect(toolbarWidth(visible, metrics)).toBeLessThanOrEqual(available)
    }
  })
})

