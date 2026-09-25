// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { AccessibilityAssessmentOutput } from "@adt/types"

const navigateMock = vi.fn()
const routerMock = { state: { location: {} } }
let routeSearch: Record<string, unknown> = {}

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
  useRouter: () => routerMock,
  useSearch: () => routeSearch,
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

let assessmentAvailable = true
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
  useAccessibilityAssessment: () => ({ data: { assessment: assessmentAvailable ? assessment : null }, isLoading: false, error: null }),
}))

vi.mock("@/hooks/use-book-config", () => ({
  useBookConfig: () => ({ data: { config: {} } }),
  useUpdateBookConfig: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
}))

afterEach(() => {
  cleanup()
  routeSearch = {}
  assessmentAvailable = true
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
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "/books/$label/$step",
      params: { label: "demo-book", step: "captions" },
    })))
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

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "storyboard", pageId: "pg001" },
      hash: true,
      search: expect.objectContaining({ sectionId: "pg001_sec001", validationReturn: expect.objectContaining({ tab: "accessibility-summary", category: "structure-semantics" }) }),
    })))
  })
})

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn() }) }))

vi.mock("@/api/client", () => ({ api: { getPages: async () => [{ pageId: "pg001", sections: [
 { sectionId: "pg001_sec001", isPruned: false, hasStableId: true },
 { sectionId: "pg001_sec002", isPruned: false, hasStableId: true },
] }] } }))

it("explains replacement of the original assessment while retaining its requested filter", async () => {
  routeSearch = { validationContext: { tab: "accessibility-summary", assessment: "retired-assessment", category: "structure-semantics" } }
  const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
  render(<AccessibilityOverviewTab label="demo-book" />)
  expect(screen.getByRole("status").textContent).toContain("original assessment is no longer current")
  expect(screen.getByText("Fix heading order")).toBeTruthy()
  expect(screen.queryByText("Add alt text")).toBeNull()
  expect(navigateMock).not.toHaveBeenCalled()
})

it("returns to the manual finding when the same rule also has a confirmed violation", async () => {
  const manual = assessment.pages[0].incomplete[0]
  const originalId = manual.id
  manual.id = "image-alt"
  try {
    const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
    render(<AccessibilityOverviewTab label="demo-book" />)
    const manualCard = screen.getByText(manual.help).closest("[id]")!
    fireEvent.click(within(manualCard as HTMLElement).getByRole("button", { name: /Open Page 1/ }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    const context = navigateMock.mock.calls[0][0].search.validationContext
    expect(context.findingId).toBe("review:image-alt")
    expect(manualCard.id).toBe("validation-finding-review:image-alt")
    expect(document.querySelectorAll('[id="validation-finding-violation:image-alt"]')).toHaveLength(1)
  } finally { manual.id = originalId }
})

it("explains a deleted original assessment without implying that its findings passed", async () => {
  assessmentAvailable = false
  routeSearch = { validationContext: { tab: "accessibility-summary", assessment: "deleted" } }
  const { AccessibilityOverviewTab } = await import("./AccessibilityValidationTabs")
  render(<AccessibilityOverviewTab label="demo-book" />)
  expect(screen.getByText(/original assessment is no longer available/).textContent).toContain("no finding has been marked resolved")
  expect(navigateMock).not.toHaveBeenCalled()
})
