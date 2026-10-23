import { describe, expect, it } from "vitest"
import type { PageSummarySection } from "@/api/client"
import {
  currentSectionIndex,
  nextPendingSectioning,
  planRerender,
  restoredWithoutHtml,
  sectioningChanged,
  togglePruned,
  withPendingPrune,
  type RenderedSections,
  type SectioningTree,
} from "./sectioningDraft"

function tree(pruned: boolean[], types: string[] = []): SectioningTree {
  return {
    reasoning: "",
    sections: pruned.map((isPruned, index) => ({
      sectionId: `s${index}`,
      sectionType: types[index] ?? "text_only",
      nodes: [],
      backgroundColor: "#fff",
      textColor: "#000",
      pageNumber: 1,
      isPruned,
    })),
  }
}

function summary(pruned: boolean[]): PageSummarySection[] {
  return pruned.map((isPruned, sectionIndex) => ({
    sectionId: `s${sectionIndex}`,
    sectionIndex,
    sectionType: "text_only",
    isActivity: false,
    isPruned,
    textPreview: "",
  }))
}

function rendered(indices: number[]): RenderedSections {
  return indices.map((sectionIndex) => ({ sectionIndex, sectionType: "text_only", reasoning: "", html: `<p>${sectionIndex}</p>` }))
}

describe("togglePruned", () => {
  it("flips only the targeted section without mutating the base", () => {
    const base = tree([false, false])
    const next = togglePruned(base, 1)
    expect(next.sections.map((section) => section.isPruned)).toEqual([false, true])
    expect(base.sections[1].isPruned).toBe(false)
  })

  it("ignores an index outside the page", () => {
    const base = tree([false])
    expect(togglePruned(base, 4)).toBe(base)
  })
})

describe("nextPendingSectioning", () => {
  it("buffers a prune as a pending draft", () => {
    const saved = tree([false, false])
    const pending = nextPendingSectioning(saved, null, 0)
    expect(pending?.sections[0].isPruned).toBe(true)
    expect(sectioningChanged(saved, pending)).toBe(true)
  })

  it("drops the draft once a toggle brings the page back to its saved state", () => {
    const saved = tree([false, true])
    const pending = nextPendingSectioning(saved, null, 1)
    expect(pending).not.toBeNull()
    expect(nextPendingSectioning(saved, pending, 1)).toBeNull()
  })

  it("keeps toggles on different sections together in one draft", () => {
    const saved = tree([false, false, true])
    const first = nextPendingSectioning(saved, null, 0)
    const second = nextPendingSectioning(saved, first, 2)
    expect(second?.sections.map((section) => section.isPruned)).toEqual([true, false, false])
  })

  it("does nothing without a sectioning tree", () => {
    expect(nextPendingSectioning(null, null, 0)).toBeNull()
  })
})

describe("withPendingPrune", () => {
  it("overlays the draft's pruned flags on the page summary", () => {
    const sections = summary([false, true])
    const merged = withPendingPrune(sections, tree([true, false]))
    expect(merged.map((section) => section.isPruned)).toEqual([true, false])
  })

  it("returns the summary untouched when nothing is pending", () => {
    const sections = summary([false])
    expect(withPendingPrune(sections, null)).toBe(sections)
  })
})

describe("re-render on restore", () => {
  const saved = tree([true, true, false])

  it("only flags restored sections that never got rendered HTML", () => {
    const pending = tree([false, false, false])
    expect(restoredWithoutHtml(saved, pending, rendered([0, 2]))).toEqual([1])
  })

  it("never flags a prune", () => {
    expect(restoredWithoutHtml(saved, tree([true, true, true]), [])).toEqual([])
  })

  it("re-renders and keeps the storyboard in sync when a provider is available", () => {
    expect(planRerender(saved, tree([false, true, false]), [], true)).toEqual({ rerender: [0], renderingInSync: true })
  })

  it("marks the storyboard out of sync when the HTML cannot be rebuilt", () => {
    expect(planRerender(saved, tree([false, true, false]), [], false)).toEqual({ rerender: [], renderingInSync: false })
  })

  it("skips custom activities, whose grading script a re-render would flatten", () => {
    const custom = tree([true, false], ["activity_custom_quiz", "text_only"])
    expect(planRerender(custom, tree([false, false], ["activity_custom_quiz"]), [], true)).toEqual({
      rerender: [],
      renderingInSync: false,
    })
  })

  it("stays in sync when the restored section still has its HTML", () => {
    expect(planRerender(saved, tree([false, true, false]), rendered([0]), true)).toEqual({ rerender: [], renderingInSync: true })
  })
})

describe("currentSectionIndex", () => {
  const sections = summary([false, false, false])

  it("prefers the canvas selection", () => {
    expect(currentSectionIndex(sections, 2, 1)).toBe(2)
  })

  it("falls back to the focused section, then the first one", () => {
    expect(currentSectionIndex(sections, null, 1)).toBe(1)
    expect(currentSectionIndex(sections, null, null)).toBe(0)
  })

  it("ignores indices that are not on the page", () => {
    expect(currentSectionIndex(sections, 7, 9)).toBe(0)
    expect(currentSectionIndex([], 0, 0)).toBeNull()
  })
})
