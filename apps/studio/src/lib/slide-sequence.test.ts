import { describe, expect, it } from "vitest"
import type { Quiz } from "@adt/types"
import type { PageSummaryItem, ReadingOrderEntry } from "@/api/client"
import {
  buildSlides,
  findSlideIndex,
  resolveStructuralTarget,
  slideId,
  stepSlide,
} from "./slide-sequence"

/** Two pages of two sections each, plus a quiz anchored after the first page. */
function pages(): PageSummaryItem[] {
  return ["pg001", "pg002"].map(
    (pageId, i) =>
      ({
        pageId,
        pageNumber: i + 1,
        sectionCount: 2,
        sections: [1, 2].map((n) => ({
          sectionId: `${pageId}_sec00${n}`,
          sectionIndex: n - 1,
          sectionType: "content",
          isPruned: false,
        })),
      }) as unknown as PageSummaryItem,
  )
}

function quizzes(): Quiz[] {
  return [{ quizId: "qz001", afterPageId: "pg001" } as unknown as Quiz]
}

function order(...ids: string[]): ReadingOrderEntry[] {
  return ids.map((id) => ({ kind: id.startsWith("qz") ? "quiz" : "section", id }))
}

const ALL = ["pg001_sec001", "pg001_sec002", "qz001", "pg002_sec001", "pg002_sec002"]

function ids(slides: ReturnType<typeof buildSlides>): string[] {
  return slides.map(slideId)
}

describe("buildSlides", () => {
  it("follows the reading order, quizzes included", () => {
    const slides = buildSlides(pages(), quizzes(), new Set(ALL), order(...ALL))
    expect(ids(slides)).toEqual(ALL)
    expect(slides.map((s) => s.position)).toEqual([1, 2, 3, 4, 5])
  })

  it("follows a rearranged order rather than the source-page order", () => {
    // The whole point: the arrows have to walk this, not `usePages()`.
    const rearranged = ["pg002_sec002", "qz001", "pg001_sec001", "pg002_sec001", "pg001_sec002"]
    const slides = buildSlides(pages(), quizzes(), new Set(ALL), order(...rearranged))
    expect(ids(slides)).toEqual(rearranged)
  })

  it("keeps a slot that produces no output page, but gives it no number", () => {
    // A section removed from the book, or one the storyboard never rendered.
    // It stays navigable — that is the row the user clicks to put it back —
    // while the numbering the reader sees closes over the gap.
    const rendered = new Set(ALL.filter((id) => id !== "pg001_sec002"))
    const slides = buildSlides(pages(), quizzes(), rendered, order(...ALL))

    expect(ids(slides)).toEqual(ALL)
    expect(slides.map((s) => s.position)).toEqual([1, null, 2, 3, 4])
  })

  it("skips a slot it cannot resolve rather than leaving a hole", () => {
    // The stored order can name an id the book no longer has; the resolver
    // reconciles that away server-side, but a draft can be momentarily ahead.
    const slides = buildSlides(pages(), quizzes(), new Set(ALL), order("pg001_sec001", "ghost_sec001", "pg002_sec001"))
    expect(ids(slides)).toEqual(["pg001_sec001", "pg002_sec001"])
  })

  it("drops a quiz whose anchor page is gone", () => {
    const orphan = [{ quizId: "qz009", afterPageId: "pg404" } as unknown as Quiz]
    const slides = buildSlides(pages(), orphan, new Set(ALL), order("pg001_sec001", "qz009"))
    expect(ids(slides)).toEqual(["pg001_sec001"])
  })

  it("carries the owning page, so a caller can navigate to the slide", () => {
    const slides = buildSlides(pages(), quizzes(), new Set(ALL), order(...ALL))
    expect(slides.map((s) => s.page.pageId)).toEqual([
      "pg001",
      "pg001",
      // A quiz reports its anchor page — it has no page of its own.
      "pg001",
      "pg002",
      "pg002",
    ])
  })

  it("is empty until the book's pages and reading order have both loaded", () => {
    expect(buildSlides(undefined, quizzes(), new Set(ALL), order(...ALL))).toEqual([])
    expect(buildSlides(pages(), quizzes(), undefined, order(...ALL))).toEqual([])
  })
})

describe("stepping through the sequence", () => {
  const all = () => buildSlides(pages(), quizzes(), new Set(ALL), order(...ALL))

  it("steps from a section into the quiz that follows it", () => {
    const slides = all()
    const at = findSlideIndex(slides, { sectionId: "pg001_sec002" })
    expect(stepSlide(slides, at, 1)).toEqual({ kind: "quiz", quizId: "qz001" })
  })

  it("steps out of a quiz onto the next section", () => {
    // The old page-based walk went dead here: a quiz belongs to no page, so
    // both arrows were disabled and the only way out was the sidebar.
    const slides = all()
    const at = findSlideIndex(slides, { quizId: "qz001" })
    expect(stepSlide(slides, at, 1)).toEqual({
      kind: "section",
      pageId: "pg002",
      sectionId: "pg002_sec001",
    })
    expect(stepSlide(slides, at, -1)).toEqual({
      kind: "section",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    })
  })

  it("crosses a page boundary in one step", () => {
    const slides = all()
    const at = findSlideIndex(slides, { sectionId: "pg002_sec001" })
    expect(stepSlide(slides, at, 1)).toEqual({
      kind: "section",
      pageId: "pg002",
      sectionId: "pg002_sec002",
    })
  })

  it("follows a rearranged order, not the source order", () => {
    // pg002_sec002 is last in the PDF; here it is first, and "next" from it is
    // the quiz — which the source-order walk could never have reached.
    const rearranged = ["pg002_sec002", "qz001", "pg001_sec001", "pg002_sec001", "pg001_sec002"]
    const slides = buildSlides(pages(), quizzes(), new Set(ALL), order(...rearranged))
    const at = findSlideIndex(slides, { sectionId: "pg002_sec002" })
    expect(at).toBe(0)
    expect(stepSlide(slides, at, 1)).toEqual({ kind: "quiz", quizId: "qz001" })
    expect(stepSlide(slides, at, -1)).toBeNull()
  })

  it("stops at the end of the book", () => {
    const slides = all()
    const last = findSlideIndex(slides, { sectionId: "pg002_sec002" })
    expect(stepSlide(slides, last, 1)).toBeNull()
  })

  it("steps onto a slot with no book page, so it can be put back", () => {
    // A removed section keeps its place in the sequence. Skipping it would
    // leave no way to reach the row that offers "Add back to book".
    const rendered = new Set(ALL.filter((id) => id !== "pg001_sec002"))
    const slides = buildSlides(pages(), quizzes(), rendered, order(...ALL))
    const at = findSlideIndex(slides, { sectionId: "pg001_sec001" })
    expect(stepSlide(slides, at, 1)).toEqual({
      kind: "section",
      pageId: "pg001",
      sectionId: "pg001_sec002",
    })
  })

  it("reports no step for a selection the sequence does not hold", () => {
    const slides = all()
    expect(findSlideIndex(slides, { sectionId: "ghost_sec001" })).toBe(-1)
    expect(stepSlide(slides, -1, 1)).toBeNull()
  })
})

describe("resolveStructuralTarget", () => {
  const sec = (...ids: string[]) => ids.map((sectionId) => ({ sectionId }))

  it("waits while the edit's tree has not arrived", () => {
    // The structural routes return an index into the tree they just wrote. The
    // view still holds the old one, so answering now would be a guess.
    const before = sec("a", "b", "c")
    expect(resolveStructuralTarget(before, before, 1)).toEqual({ wait: true })
  })

  it("resolves a clone of the last section, whose index the old tree lacked", () => {
    const before = sec("a", "b", "c")
    const after = sec("a", "b", "c", "c-clone")
    expect(resolveStructuralTarget(after, before, 3)).toEqual({
      wait: false,
      sectionId: "c-clone",
    })
  })

  it("resolves a delete to the section that took the slot, not the deleted one", () => {
    // Delete "b" of a/b/c and ask for index 1. Against the old tree that is
    // "b" — the section that no longer exists.
    const before = sec("a", "b", "c")
    const after = sec("a", "c")
    expect(resolveStructuralTarget(after, before, 1)).toEqual({ wait: false, sectionId: "c" })
  })

  it("falls back to the last section when the index is past the new end", () => {
    const before = sec("a", "b", "c")
    const after = sec("a")
    expect(resolveStructuralTarget(after, before, 2)).toEqual({ wait: false, sectionId: "a" })
  })

  it("reports nothing to open when the page has no sections left", () => {
    expect(resolveStructuralTarget([], sec("a"), 0)).toEqual({ wait: false, sectionId: null })
  })

  it("compares identity, not length", () => {
    // An edit that replaces a section's content leaves the count alone; the
    // view still has to wait for it rather than resolving against the old tree.
    const before = sec("a", "b")
    const after = sec("a", "b2")
    expect(resolveStructuralTarget(after, before, 1)).toEqual({ wait: false, sectionId: "b2" })
  })
})
