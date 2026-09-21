// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

const publicationStatusMock = vi.fn<() => unknown>(() => undefined)
const feedbackBadgeMock = vi.fn(() => ({ published: false, unresolvedCount: 0, loaded: false, unavailable: false }))
vi.mock("@/hooks/use-book-publication", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-book-publication")>("@/hooks/use-book-publication")
  return { ...actual, useBookPublication: () => ({ data: publicationStatusMock() }) }
})
vi.mock("@/components/publication-feedback/use-feedback-badge", () => ({
  useFeedbackBadge: () => feedbackBadgeMock(),
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
  matchRouteMock.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  stageStateMock.mockImplementation(defaultStageState)
  publicationStatusMock.mockReturnValue(undefined)
  feedbackBadgeMock.mockReturnValue({ published: false, unresolvedCount: 0, loaded: false, unavailable: false })
})

/** Sharing is not a pipeline stage, so its disc only fills once a link is live, and the count
 *  beside it is the reviewer comments still waiting — never a completion state of its own. */
describe("StageSidebar — sharing row", () => {
  it("fills the disc once the book has a live link and counts the open comments", async () => {
    publicationStatusMock.mockReturnValue({
      record: { token: "t", revoked_at: null, expires_at: null },
      publication: { current_version: 1, revoked_at: null, expires_at: null },
    })
    feedbackBadgeMock.mockReturnValue({ published: true, unresolvedCount: 5, loaded: true, unavailable: false })
    const { StageSidebar } = await import("./components/StageSidebar")
    render(<StageSidebar bookLabel="my-book" activeStep="book" />)

    const badge = screen.getByTitle("5 comments waiting for you")
    expect(badge.textContent).toBe("5")
    expect(badge.getAttribute("role")).toBe("img")
    const row = screen.getByTitle("Sharing")
    expect(row.querySelector(".bg-indigo-600")).not.toBeNull()
  })

  it("leaves the disc empty and unbadged for a book that was never shared", async () => {
    const { StageSidebar } = await import("./components/StageSidebar")
    render(<StageSidebar bookLabel="my-book" activeStep="book" />)

    expect(screen.queryByTitle(/comments? waiting for you/)).toBeNull()
    const row = screen.getByTitle("Sharing")
    expect(row.querySelector(".bg-indigo-600")).toBeNull()
  })
})

describe("StageSidebar", () => {
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
