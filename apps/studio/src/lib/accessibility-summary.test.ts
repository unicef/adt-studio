import { describe, expect, it, vi } from "vitest"
import type { AccessibilityAssessmentOutput } from "@adt/types"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) {
        text += String(values[index])
      }
    }
    return { id: text }
  },
}))

const {
  buildAccessibilityOverview,
  buildFrequentAccessibilityFindings,
  findAccessibilityPage,
  normalizeAccessibilityHref,
  summarizeAccessibilityPage,
} = await import("./accessibility-summary")

const assessment: AccessibilityAssessmentOutput = {
  generatedAt: "2026-03-16T10:00:00.000Z",
  tool: "axe-core",
  runOnlyTags: ["wcag2a"],
  disabledRules: [],
  summary: {
    pageCount: 3,
    pagesWithViolations: 2,
    pagesWithErrors: 0,
    violationCount: 4,
    incompleteCount: 1,
  },
  pages: [
    {
      pageId: "pg001",
      sectionId: "pg001_sec001",
      href: "index.html",
      pageNumber: 1,
      title: "Cover",
      violationCount: 2,
      incompleteCount: 1,
      passCount: 4,
      inapplicableCount: 0,
      violations: [
        {
          id: "image-alt",
          impact: "critical",
          description: "Images need alternative text",
          help: "Add alt text",
          helpUrl: "https://example.com/image-alt",
          tags: ["cat.text-alternatives"],
          nodes: [],
        },
        {
          id: "landmark-one-main",
          impact: "moderate",
          description: "Document should have one main landmark",
          help: "Ensure page content is contained by landmarks",
          helpUrl: "https://example.com/landmark-one-main",
          tags: ["cat.semantics"],
          nodes: [],
        },
      ],
      incomplete: [
        {
          id: "color-contrast",
          impact: null,
          description: "Needs manual contrast review",
          help: "Review contrast",
          helpUrl: "https://example.com/color-contrast",
          tags: ["cat.color"],
          nodes: [],
        },
      ],
    },
    {
      pageId: "pg002",
      sectionId: "pg002_sec001",
      href: "chapter.html",
      pageNumber: 2,
      title: "Chapter",
      violationCount: 2,
      incompleteCount: 0,
      passCount: 5,
      inapplicableCount: 0,
      violations: [
        {
          id: "landmark-one-main",
          impact: "moderate",
          description: "Document should have one main landmark",
          help: "Ensure page content is contained by landmarks",
          helpUrl: "https://example.com/landmark-one-main",
          tags: ["cat.semantics"],
          nodes: [],
        },
        {
          id: "heading-order",
          impact: "moderate",
          description: "Heading levels should only increase by one",
          help: "Fix heading order",
          helpUrl: "https://example.com/heading-order",
          tags: ["cat.structure"],
          nodes: [],
        },
      ],
      incomplete: [],
    },
    {
      pageId: null,
      sectionId: "qz001",
      href: "quiz.html",
      pageNumber: null,
      title: "Quiz",
      violationCount: 0,
      incompleteCount: 0,
      passCount: 3,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    },
  ],
}

describe("normalizeAccessibilityHref", () => {
  it("normalizes preview paths to packaged hrefs", () => {
    expect(normalizeAccessibilityHref("/api/books/demo/adt/v-12345/")).toBe("index.html")
    expect(normalizeAccessibilityHref("/api/books/demo/adt/v-12345/quiz.html?lang=en#top")).toBe("quiz.html")
  })
})

describe("buildAccessibilityOverview", () => {
  it("builds severity and category summaries", () => {
    const overview = buildAccessibilityOverview(assessment)

    expect(overview.totalChecks).toBe(5)
    expect(overview.severity.critical).toBe(1)
    expect(overview.severity.moderate).toBe(3)
    expect(overview.categories[0]).toMatchObject({ key: "structure-semantics", label: "structure-semantics", count: 3 })
    expect(overview.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "text-alternatives", label: "text-alternatives", count: 1 }),
        expect.objectContaining({ key: "visual-cues", label: "visual-cues", count: 1 }),
      ])
    )
  })
})

describe("buildFrequentAccessibilityFindings", () => {
  it("highlights findings present on the most pages first", () => {
    const findings = buildFrequentAccessibilityFindings(assessment)

    expect(findings[0]).toMatchObject({
      id: "landmark-one-main",
      pagesAffected: 2,
      count: 2,
      reviewOnly: false,
      categoryLabel: "structure-semantics",
    })
    expect(findings.find((entry) => entry.id === "image-alt")).toMatchObject({
      pagesAffected: 1,
      pageCoverage: 1 / 3,
      pages: [
        expect.objectContaining({ pageId: "pg001", href: "index.html", pageNumber: 1, count: 1 }),
      ],
    })
    expect(findings.find((entry) => entry.id === "color-contrast")).toMatchObject({
      reviewOnly: true,
      impact: "unknown",
    })
  })
})

describe("findAccessibilityPage", () => {
  it("prefers section id and falls back to href", () => {
    expect(findAccessibilityPage(assessment, { sectionId: "pg001_sec001" })?.href).toBe("index.html")
    expect(findAccessibilityPage(assessment, { href: "/api/books/demo/adt/v-99/quiz.html" })?.sectionId).toBe("qz001")
  })
})

describe("summarizeAccessibilityPage", () => {
  it("summarizes page counts and categories", () => {
    const pageSummary = summarizeAccessibilityPage(assessment.pages[0])

    expect(pageSummary).toMatchObject({
      issueCount: 2,
      reviewCount: 1,
      totalCount: 3,
      status: "issues",
    })
    expect(pageSummary?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "text-alternatives", label: "text-alternatives", count: 1 }),
      ])
    )
  })
})
