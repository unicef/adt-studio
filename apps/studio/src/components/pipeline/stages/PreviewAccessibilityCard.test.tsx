// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { AccessibilityAssessmentOutput } from "@adt/types"
import type { PageAccessibilitySummary } from "@/lib/accessibility-summary"
import type { AccessibilityPageResult } from "@adt/types"

function templateToString(strings: TemplateStringsArray, values: unknown[]) {
  let text = ""
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index]
    if (index < values.length) text += String(values[index])
  }
  return text
}

const mockI18n = {
  _(descriptor: { id: string; values?: Record<string, unknown> }) {
    if (!descriptor.values) return descriptor.id
    let result = descriptor.id
    for (const [key, value] of Object.entries(descriptor.values)) {
      result = result.replace(`{${key}}`, String(value))
    }
    return result
  },
}

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Build a message descriptor that matches Lingui's format
    let id = ""
    for (let i = 0; i < strings.length; i++) {
      id += strings[i]
      if (i < values.length) id += `{${i}}`
    }
    const vals: Record<string, unknown> = {}
    for (let i = 0; i < values.length; i++) vals[String(i)] = values[i]
    return { id, values: vals }
  },
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return templateToString(strings, values)
    },
    i18n: mockI18n,
  }),
}))

const assessment: AccessibilityAssessmentOutput = {
  generatedAt: "2026-03-16T10:00:00.000Z",
  tool: "axe-core",
  runOnlyTags: ["wcag2a"],
  disabledRules: [],
  summary: {
    pageCount: 1,
    pagesWithViolations: 1,
    pagesWithErrors: 0,
    violationCount: 2,
    incompleteCount: 1,
  },
  pages: [],
}

const currentPageSummary: PageAccessibilitySummary = {
  sectionId: "pg001_sec001",
  href: "index.html",
  title: "Cover",
  issueCount: 2,
  reviewCount: 1,
  totalCount: 3,
  hasError: false,
  status: "issues",
  categories: [],
}

const currentPageResult: AccessibilityPageResult = {
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
}

beforeEach(() => {
  window.sessionStorage.setItem("adt-preview-a11y-card:demo-book", "expanded")
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe("PreviewAccessibilityCard", () => {
  it("separates confirmed issues from manual-review findings", async () => {
    const { PreviewAccessibilityCard } = await import("./PreviewAccessibilityCard")

    render(
      <PreviewAccessibilityCard
        label="demo-book"
        assessment={assessment}
        isLoading={false}
        error={null}
        currentPage={currentPageSummary}
        currentPageResult={currentPageResult}
        panelOpen={false}
      />,
    )

    expect(screen.getAllByText("Issues").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Manual review").length).toBeGreaterThan(0)
    expect(screen.getByText("Axe could not fully evaluate these checks in preview. Verify them in-browser or by inspection.")).toBeTruthy()
    expect(screen.getByText("Add alt text")).toBeTruthy()
    expect(screen.getByText("Review contrast")).toBeTruthy()
  })

  it("shows a manual-review-only summary without calling it an issue", async () => {
    const { PreviewAccessibilityCard } = await import("./PreviewAccessibilityCard")

    render(
      <PreviewAccessibilityCard
        label="demo-book"
        assessment={{
          ...assessment,
          summary: {
            ...assessment.summary,
            violationCount: 0,
            incompleteCount: 2,
          },
        }}
        isLoading={false}
        error={null}
        currentPage={{
          ...currentPageSummary,
          issueCount: 0,
          reviewCount: 2,
          totalCount: 2,
        }}
        currentPageResult={{
          ...currentPageResult,
          violationCount: 0,
          incompleteCount: 2,
          violations: [],
          incomplete: [...currentPageResult.incomplete, { ...currentPageResult.incomplete[0], id: "focus-visible", help: "Review focus visibility" }],
        }}
        panelOpen={false}
      />,
    )

    expect(screen.getAllByText("Manual review").length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Issues$/)).toBeNull()
  })

  it("hides the previous build's page findings while the new build is still being audited", async () => {
    const { PreviewAccessibilityCard } = await import("./PreviewAccessibilityCard")

    render(
      <PreviewAccessibilityCard
        label="demo-book"
        assessment={assessment}
        isLoading
        error={null}
        currentPage={currentPageSummary}
        currentPageResult={currentPageResult}
        panelOpen={false}
      />,
    )

    expect(screen.getByText("Loading page-level findings")).toBeTruthy()
    expect(screen.queryByText("Add alt text")).toBeNull()
  })
})
