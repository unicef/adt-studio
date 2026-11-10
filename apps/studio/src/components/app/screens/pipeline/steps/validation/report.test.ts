import { describe, expect, it, vi } from "vitest"
import type { AccessibilityAssessmentOutput } from "@adt/types"
import { buildAccessibilityReport, NO_FILTERS, resolveFindingPages, sectionPageIds } from "./report"
import { parseValidationTab } from "./useValidationTab"

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: () => null,
}))

const finding = (id: string, impact: string, tags: string[]) => ({
  id,
  impact,
  description: `${id} description`,
  help: `${id} help`,
  helpUrl: `https://example.test/${id}`,
  tags,
  nodes: [],
})

function page(pageId: string, sectionId: string, pageNumber: number | null, violations: unknown[], incomplete: unknown[] = []) {
  return {
    pageId,
    sectionId,
    href: `${sectionId}.html`,
    pageNumber,
    title: "Book title",
    violationCount: violations.length,
    incompleteCount: incomplete.length,
    passCount: 0,
    inapplicableCount: 0,
    violations,
    incomplete,
  }
}

const assessment = {
  summary: { pageCount: 3, pagesWithViolations: 2, pagesWithErrors: 0, violationCount: 3, incompleteCount: 1 },
  pages: [
    page("pg001", "pg001_sec001", null, [finding("image-alt", "critical", ["cat.text-alternatives"])]),
    page("pg002", "pg002_sec001", 2, [finding("image-alt", "critical", ["cat.text-alternatives"])], [finding("color-contrast", "serious", ["cat.color"])]),
    page("pg002", "pg002_sec002", 2, [finding("heading-order", "moderate", ["cat.semantics"])]),
  ],
} as unknown as AccessibilityAssessmentOutput

describe("buildAccessibilityReport", () => {
  it("lists only severities that have problems, plus the items to check", () => {
    const report = buildAccessibilityReport(assessment, NO_FILTERS)
    expect(report.kinds).toEqual([
      { value: "all", count: 4 },
      { value: "critical", count: 2 },
      { value: "moderate", count: 1 },
      { value: "review", count: 1 },
    ])
    expect(report.visible.map((entry) => entry.id)).toEqual(["image-alt", "heading-order", "color-contrast"])
  })

  it("keeps items to check out of a severity filter", () => {
    const report = buildAccessibilityReport(assessment, { kind: "serious", category: null })
    expect(report.visible).toEqual([])
    expect(report.kinds.find((entry) => entry.value === "serious")?.count).toBe(0)
  })

  it("filters by kind of problem", () => {
    const report = buildAccessibilityReport(assessment, { kind: "review", category: null })
    expect(report.visible.map((entry) => entry.id)).toEqual(["color-contrast"])
    expect(report.categoryTotal).toBe(1)
  })
})

describe("resolveFindingPages", () => {
  it("numbers pages from the book instead of the title, and tells sections apart", () => {
    const report = buildAccessibilityReport(assessment, NO_FILTERS)
    const links = sectionPageIds(assessment)
    const bookPages = [
      { pageId: "pg001", pageNumber: 1 },
      { pageId: "pg002", pageNumber: 2 },
    ]
    const imageAlt = report.visible.find((entry) => entry.id === "image-alt")!
    const numbered = resolveFindingPages(imageAlt.pages, links, bookPages)
    expect(Object.fromEntries(numbered.map((entry) => [entry.sectionId, [entry.pageNumber, entry.part]]))).toEqual({
      pg001_sec001: [1, null],
      pg002_sec001: [2, null],
    })
    const all = [...imageAlt.pages, ...report.visible.find((entry) => entry.id === "heading-order")!.pages]
    expect(Object.fromEntries(resolveFindingPages(all, links, bookPages).map((entry) => [entry.sectionId, entry.part]))).toEqual({
      pg001_sec001: null,
      pg002_sec001: 1,
      pg002_sec002: 2,
    })
  })
})

describe("quiz sections", () => {
  it("are named as quizzes, not pages", () => {
    const [quiz] = resolveFindingPages([{ sectionId: "qz003", href: "qz003.html", title: "Book title", pageNumber: 7, count: 1 }], new Map(), [])
    expect([quiz.quiz, quiz.pageNumber]).toEqual([3, null])
  })
})

describe("parseValidationTab", () => {
  it("reads the old tab names", () => {
    expect(parseValidationTab("reviewer-validation")).toBe("reviewer")
    expect(parseValidationTab("accessibility-config")).toBe("accessibility")
    expect(parseValidationTab(undefined)).toBe("accessibility")
  })
})
