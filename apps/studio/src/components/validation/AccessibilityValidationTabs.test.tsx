// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { AccessibilityAssessmentOutput } from "@adt/types"

const navigateMock = vi.fn()

function templateToString(strings: TemplateStringsArray, values: unknown[]) {
  let text = ""
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index]
    if (index < values.length) text += String(values[index])
  }
  // Resolve inline ICU plurals (e.g. "1 {count, plural, one {item} other {items}}")
  // the way real Lingui would, using the count rendered immediately before.
  return text.replace(
    /(\d+)\s+\{[^,}]+, plural, one \{([^}]*)\} other \{([^}]*)\}\}/g,
    (_match, count, one, other) => `${count} ${Number(count) === 1 ? one : other}`,
  )
}

const i18n = {
  _: (value: unknown) => {
    if (typeof value === "string") return value
    if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id
    return String(value ?? "")
  },
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}))

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    return { id: templateToString(strings, values) }
  },
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n,
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return templateToString(strings, values)
    },
  }),
}))

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

vi.mock("@/hooks/use-debug", () => ({
  useAccessibilityAssessment: () => ({ data: { assessment }, isLoading: false, error: null }),
}))

vi.mock("@/hooks/use-book-config", () => ({
  useBookConfig: () => ({ data: { config: {} } }),
  useUpdateBookConfig: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("AccessibilityOverviewTab", () => {
  it("filters findings by severity and opens affected pages in the responsible stage", async () => {
    const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
    render(<AccessibilityOverviewTab label="demo-book" />)

    fireEvent.click(screen.getByRole("button", { name: /Critical/i }))

    expect(screen.getByText("1 of 3 items")).toBeTruthy()
    expect(screen.getByText("Add alt text")).toBeTruthy()
    expect(screen.queryByText("Fix heading order")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Page 1/i }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step",
      params: { label: "demo-book", step: "captions" },
    })
  })

  it("shows issue and manual-review summary cards", async () => {
    const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
    render(<AccessibilityOverviewTab label="demo-book" />)

    expect(screen.getByText("Issues")).toBeTruthy()
    expect(screen.getAllByText("Manual review").length).toBeGreaterThan(0)
    expect(screen.getByText("1 manual review item")).toBeTruthy()
  })

  it("filters findings by category", async () => {
    const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
    render(<AccessibilityOverviewTab label="demo-book" />)

    fireEvent.click(screen.getByRole("button", { name: /Structure & semantics/i }))

    expect(screen.getByText("2 of 4 items")).toBeTruthy()
    expect(screen.getByText("Ensure page content is contained by landmarks")).toBeTruthy()
    expect(screen.getByText("Fix heading order")).toBeTruthy()
    expect(screen.queryByText("Add alt text")).toBeNull()
  })

  it("preserves page and section context for a section-aware fix stage", async () => {
    const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
    render(<AccessibilityOverviewTab label="demo-book" />)

    fireEvent.click(screen.getByRole("button", { name: /Structure & semantics/i }))
    fireEvent.click(screen.getByRole("button", { name: /Page 1/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "sectioning", pageId: "pg001" },
      search: { sectionId: "pg001_sec001" },
    })
  })
})
