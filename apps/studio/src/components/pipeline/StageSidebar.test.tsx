// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const defaultStageState = (slug: string) => {
  if (slug === "storyboard" || slug === "validation") return "done"
  return "idle"
}
const stageStateMock = vi.fn(defaultStageState)
const cancelRunMock = vi.fn()
const toastInfoMock = vi.fn()
const matchRouteMock = vi.fn(() => true)
const searchMock = { tab: "reviewer-checklist" }

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
  Link: ({ children, title, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a title={title} {...props}>{children}</a>
  ),
  useMatchRoute: () => matchRouteMock,
  useSearch: () => searchMock,
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    stageState: stageStateMock,
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

vi.mock("@/routes/__root", () => ({
  useSettingsDialog: () => ({ openSettings: vi.fn() }),
}))

vi.mock("@/routes/books.$label", () => ({
  useSectionNav: () => ({ skipNextResetRef: { current: false } }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  stageStateMock.mockImplementation(defaultStageState)
})

describe("StageSidebar", () => {
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
