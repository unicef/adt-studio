// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const defaultStageState = (slug: string) => {
  if (slug === "storyboard" || slug === "validation") return "done"
  return "idle"
}
const stageStateMock = vi.fn(defaultStageState)
const sourceUpdateStages: string[] = []
const cancelRunMock = vi.fn()
const toastInfoMock = vi.fn()
const matchRouteMock = vi.fn(() => true)
const searchMock = { tab: "reviewer-checklist" }
const ttsMock = vi.fn((): { data?: import("@/api/client").TTSResponse } => ({}))
vi.mock("@/hooks/use-tts", () => ({ useTTSData: () => ttsMock() }))
const outputsMock = vi.fn((): { data?: { summaries: { stages: Record<string, { applicable: number; current: boolean; updates: number; warnings: number; missing: number }> } } } => ({}))
vi.mock("@/hooks/use-outputs", () => ({ useOutputSummary: () => {
  const data = outputsMock().data
  if (!data) return {}
  const stages = data.summaries.stages
  // Mirrors the server rule; GET /outputs/summary is covered in output-entrypoints.
  const attempted = (stage: string) => stage === "speech"
    ? !["running", "queued"].includes(stageStateMock(stage)) && (["done", "error"].includes(stageStateMock(stage)) || Object.values(ttsMock().data?.languages ?? {}).some((language) => language.entries.length || language.failed?.length))
    : ["done", "error"].includes(stageStateMock(stage)) || stages[stage].applicable > stages[stage].missing
  return { data: { stages,
    stagesWithoutMissing: Object.fromEntries(Object.entries(stages).map(([stage, summary]) => [stage, summary.missing ? { applicable: 0, current: true, updates: 0, reviews: 0, warnings: 0, missing: 0 } : summary])),
    missingStages: Object.keys(stages).filter(attempted),
  } }
} }))
vi.mock("./components/OutputReview", () => ({ useOutputs: () => outputsMock(), CatalogSummary: () => <div>Selected stage outputs</div> }))

vi.mock("@lingui/core", () => ({
  i18n: {
    _: (value: unknown) => {
      if (typeof value === "string") return value
      if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
        return value.id
      }
      return String(value ?? "")
    },
  },
}))

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) text += String(values[index])
    }
    return { id: text }
  },
}))

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: {
      _: (value: unknown) => {
        if (typeof value === "string") return value
        if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
          return value.id
        }
        return String(value ?? "")
      },
    },
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    title,
    to,
    search,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    search?: { tab?: string }
  }) => (
    <a title={title} data-to={to} data-tab={search?.tab} {...props}>{children}</a>
  ),
  useMatchRoute: () => matchRouteMock,
  useNavigate: () => vi.fn(),
  useSearch: () => searchMock,
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }),
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    stageState: stageStateMock,
    sourceUpdateStages,
    stepState: vi.fn(() => "idle"),
    stepProgress: vi.fn(() => null),
    cancelRun: cancelRunMock,
    isCancelling: false,
  }),
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    info: toastInfoMock,
  },
}))

vi.mock("@/hooks/use-debug", () => ({
  useAccessibilityAssessment: () => ({
    data: {
      assessment: {
        generatedAt: "2026-03-16T10:00:00.000Z",
        tool: "axe-core",
        runOnlyTags: ["wcag2a"],
        disabledRules: [],
        summary: { pageCount: 1, pagesWithViolations: 1, pagesWithErrors: 0, violationCount: 1, incompleteCount: 0 },
        pages: [],
      },
    },
  }),
}))

vi.mock("@/hooks/use-book-tasks", () => ({
  useBookTasks: () => ({ runningTasks: [], runningCount: 0, tasks: [] }),
}))

vi.mock("@/hooks/use-books", () => ({
  usePackageAdtStatus: () => ({ data: { hasAdt: false } }),
}))

vi.mock("@/hooks/use-sign-language-videos", () => ({
  useSignLanguageVideos: () => ({ data: { videos: [] } }),
}))

vi.mock("@/hooks/use-stage-missing-counts", () => ({
  useStageMissingCounts: () => ({ translate: 0, speech: 0 }),
}))

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [] }),
  usePageImage: () => ({ data: null }),
}))

vi.mock("@/hooks/use-quizzes", () => ({
  useQuizzes: () => ({ data: null }),
}))

vi.mock("@/routes/books.$label", () => ({
  useSectionNav: () => ({ skipNextResetRef: { current: false } }),
}))

beforeEach(() => {
  sourceUpdateStages.length = 0;
  matchRouteMock.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  stageStateMock.mockImplementation(defaultStageState)
  outputsMock.mockReturnValue({})
  ttsMock.mockReturnValue({})
})

describe("StageSidebar", () => {
  it.each(["idle", "queued", "running", "done", "error"] as const)("keeps missing-only Speech attention consistent with the %s attempt state", async (state) => {
    outputsMock.mockReturnValue({ data: { summaries: { stages: { speech: { applicable: 3, current: false, updates: 0, warnings: 0, missing: 3 } } } } })
    stageStateMock.mockImplementation((stage) => stage === "speech" ? state : "idle")
    const { StageSidebar } = await import("./components/StageSidebar")
    render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    const button = screen.queryByRole("button", { name: /Review Speech outputs/ })
    expect(!!button).toBe(state === "done" || state === "error")
  })
  it("keeps failed-only speech visible after an attempt reset, then hides it after Delete all speech", async () => {
    outputsMock.mockReturnValue({ data: { summaries: { stages: { speech: { applicable: 3, current: false, updates: 0, warnings: 0, missing: 3 } } } } })
    stageStateMock.mockReturnValue("idle")
    ttsMock.mockReturnValue({ data: { languages: { en: { entries: [], failed: [{ textId: "stable", error: "Unavailable" }], generatedAt: "before", version: 1 } } } })
    const { StageSidebar } = await import("./components/StageSidebar")
    const view = render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByRole("button", { name: /Review Speech outputs.*Missing: 3/ })).toBeTruthy()
    ttsMock.mockReturnValue({ data: { languages: { en: { entries: [], failed: [], generatedAt: "after", version: 2 } } } })
    view.rerender(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.queryByRole("button", { name: /Review Speech outputs/ })).toBeNull()
  })
  it("AC-15 shows existing stale/protected outputs despite a completed job and opens the affected items", async () => {
    stageStateMock.mockReturnValue("done")
    outputsMock.mockReturnValue({ data: { summaries: { stages: { translate: { applicable: 4, current: false, updates: 1, warnings: 2, missing: 0 } } } } })
    const { StageSidebar } = await import("./components/StageSidebar")
    const view = render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByTitle("Language").getAttribute("aria-label")).toContain("needs update")
    fireEvent.click(screen.getByRole("button", { name: /Review Language outputs.*Updates: 1.*Warnings: 2.*Missing: 0/ }))
    expect(screen.getByRole("dialog").textContent).toContain("Selected stage outputs")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    outputsMock.mockReturnValue({ data: { summaries: { stages: { translate: { applicable: 4, current: true, updates: 0, warnings: 0, missing: 0 } } } } })
    view.rerender(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByTitle("Language").getAttribute("aria-label")).toContain("done")
    expect(screen.queryByRole("button", { name: /Review Language outputs/ })).toBeNull()
  })

  it("mirrors saved-output attention on the stage icon while the rail is collapsed", async () => {
    matchRouteMock.mockReturnValue(false)
    stageStateMock.mockImplementation((stage) => stage === "sectioning" || stage === "translate" ? "done" : "idle")
    outputsMock.mockReturnValue({ data: { summaries: { stages: { translate: { applicable: 4, current: false, updates: 1, warnings: 0, missing: 0 } } } } })
    const { StageSidebar } = await import("./components/StageSidebar")
    const view = render(<StageSidebar bookLabel="demo-book" activeStep="sectioning" />)
    const badge = screen.getByRole("img", { name: "Updates: 1. Needs review: 0. Warnings: 0. Missing: 0." })
    expect(badge.className).toContain("bg-amber-600")
    expect(screen.getByTitle("Language").contains(badge)).toBe(true)
    // Expanded rail: the review button beside the label is visible instead.
    matchRouteMock.mockReturnValue(true)
    view.rerender(<StageSidebar bookLabel="demo-book" activeStep="sectioning" />)
    expect(screen.queryByRole("img", { name: /Updates:/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Review Language outputs.*Updates: 1/ })).toBeTruthy()
  })

  it("keeps the review icon legible on the active stage's colored row", async () => {
    stageStateMock.mockReturnValue("done")
    outputsMock.mockReturnValue({ data: { summaries: { stages: { translate: { applicable: 4, current: false, updates: 1, warnings: 0, missing: 0 } } } } })
    const { StageSidebar } = await import("./components/StageSidebar")
    const view = render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByRole("button", { name: /Review Language outputs/ }).className).toContain("text-amber-600")
    view.rerender(<StageSidebar bookLabel="demo-book" activeStep="translate" />)
    expect(screen.getByRole("button", { name: /Review Language outputs/ }).className).toContain("text-white")
  })

  it("AC-15 preserves running/error job status separately from saved output warnings", async () => {
    outputsMock.mockReturnValue({ data: { summaries: { stages: { speech: { applicable: 3, current: true, updates: 0, warnings: 1, missing: 0 } } } } })
    stageStateMock.mockImplementation((stage) => stage === "speech" ? "running" : "idle")
    const { StageSidebar } = await import("./components/StageSidebar")
    const view = render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByTitle("Speech").getAttribute("aria-label")).toContain("in progress")
    expect(screen.getByRole("button", { name: /Review Speech outputs.*Warnings: 1/ })).toBeTruthy()
    stageStateMock.mockImplementation((stage) => stage === "speech" ? "error" : "idle")
    view.rerender(<StageSidebar bookLabel="demo-book" activeStep="book" />)
    expect(screen.getByTitle("Speech: failed")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Review Speech outputs.*Warnings: 1/ })).toBeTruthy()
  })
  it("routes the book settings button to the API Keys section", async () => {
    matchRouteMock.mockReturnValue(true)
    const { StageSidebar } = await import("./components/StageSidebar")
    render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="book"
      />,
    )

    const settingsLink = screen.getByTitle("API Key Settings")
    expect(settingsLink.getAttribute("data-to")).toBe(
      "/books/$label/$step/settings",
    )
    expect(settingsLink.getAttribute("data-tab")).toBe("general")
    expect(screen.getByText("API Keys")).toBeTruthy()
    expect(screen.getByText("Models")).toBeTruthy()
    expect(screen.queryByText("Global Prompts")).toBeNull()
  })

  it.each(["quizzes", "glossary", "toc", "captions"])("keeps the %s Overview (and its Run button) after a reset leaves the stage idle", async (stage) => {
    matchRouteMock.mockReturnValue(true)
    stageStateMock.mockReturnValue("idle")
    const { StageSidebar } = await import("./components/StageSidebar")
    render(<StageSidebar bookLabel="demo-book" activeStep={stage} />)
    expect(screen.getByText("Overview").closest("a")?.getAttribute("data-tab")).toBe("overview")
  })

  it("shows Validation before Preview and exposes Validation settings tabs", async () => {
    const { StageSidebar } = await import("./components/StageSidebar")
    const { container } = render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="validation"
      />,
    )

    const validationLink = screen.getByTitle("Validation")
    const previewLink = screen.getByTitle("Preview")
    expect(validationLink.compareDocumentPosition(previewLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByTitle("Validation Settings")).toBeTruthy()
    expect(screen.getByText("Accessibility")).toBeTruthy()
    expect(screen.getByText("Reviewer Checklist")).toBeTruthy()
    expect(container.textContent).toContain("Validation")
    expect(container.textContent).toContain("Preview")
  })

  it("shows a red error badge on failed stages", async () => {
    stageStateMock.mockImplementation((slug: string) => {
      if (slug === "storyboard") return "error"
      return defaultStageState(slug)
    })

    const { StageSidebar } = await import("./components/StageSidebar")
    const { container } = render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="storyboard"
      />,
    )

    const errorBadge = screen.getByTitle("Storyboard: failed")
    expect(errorBadge.className).toContain("bg-red-600")
    expect(errorBadge.getAttribute("role")).toBe("img")
    expect(container.querySelector('circle[stroke="#ef4444"]')).toBeNull()
  })

  it("shows a cancel button over a running stage icon and requests cancellation", async () => {
    stageStateMock.mockImplementation((slug: string) => {
      if (slug === "storyboard") return "running"
      return defaultStageState(slug)
    })

    const { StageSidebar } = await import("./components/StageSidebar")
    render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="storyboard"
      />,
    )

    const cancelButton = screen.getByTitle("Cancel Storyboard step")
    expect(cancelButton.className).toContain("bg-red-600")
    expect(cancelButton.className).toContain("left-2")
    expect(cancelButton.className).not.toContain("left-2.5")

    fireEvent.click(cancelButton)

    expect(cancelRunMock).toHaveBeenCalledTimes(1)
    expect(toastInfoMock).toHaveBeenCalledWith("Cancelling Storyboard step")
  })
})

it.each(["toc", "quizzes", "glossary"])("shows persisted source update attention for %s even when the job says done", async stage => {
  sourceUpdateStages.push(stage)
  stageStateMock.mockReturnValue("done")
  const { StageSidebar } = await import("./components/StageSidebar")
  render(<StageSidebar bookLabel="demo-book" activeStep="book" />)
  const badge = screen.getByRole("img", { name: "Generated before your latest edits" })
  expect(badge.className).toContain("bg-amber-600")
  expect(badge.closest("a")?.getAttribute("aria-label")).toContain("needs update")
})
