// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

const navigateMock = vi.fn()
const packageAdtMock = vi.fn(() => Promise.resolve({ status: "completed", label: "demo-book" }))
const useSearchMock = vi.fn(() => ({ tab: "accessibility-summary" }))
const reviewerCatalogMock = vi.fn(() => ({ data: { enabled: false }, isLoading: false, error: null }))
const isTaskRunningMock = vi.fn(() => false)
const getTaskMock = vi.fn(() => undefined)
const warningToastMock = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => useSearchMock(),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
    i18n: { _: (descriptor: { id?: string }) => descriptor.id ?? "" },
  }),
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

vi.mock("sonner", () => ({ toast: { warning: (message: string) => warningToastMock(message) } }))

vi.mock("@/api/client", () => ({
  api: {
    packageAdt: (...args: unknown[]) => packageAdtMock(...args),
  },
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ stageState: (slug: string) => (slug === "storyboard" ? "done" : "idle") }),
}))

vi.mock("@/hooks/use-book-tasks", () => ({
  useBookTasks: () => ({
    isTaskRunning: (...args: unknown[]) => isTaskRunningMock(...args),
    getTask: (...args: unknown[]) => getTaskMock(...args),
  }),
}))

vi.mock("@/hooks/use-reviewer-validation", () => ({
  useReviewerValidationCatalog: (...args: unknown[]) => reviewerCatalogMock(...args),
}))

vi.mock("@/hooks/use-all-pages-pruned", () => ({
  useAllPagesPruned: () => ({ allPruned: false, isLoading: false }),
}))

vi.mock("@/components/validation/AccessibilityValidationTabs", () => ({
  AccessibilityOverviewTab: ({ label }: { label: string }) => <div>accessibility-summary:{label}</div>,
}))

vi.mock("@/components/validation/ReviewerValidationSummaryTab", () => ({
  ReviewerValidationSummaryTab: ({ label }: { label: string }) => <div>reviewer-validation:{label}</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  packageAdtMock.mockResolvedValue({ status: "completed", label: "demo-book" })
  reviewerCatalogMock.mockReturnValue({ data: { enabled: false }, isLoading: false, error: null })
  useSearchMock.mockReturnValue({ tab: "accessibility-summary" })
  isTaskRunningMock.mockReturnValue(false)
  getTaskMock.mockReturnValue(undefined)
})

describe("ValidationView", () => {
  it("hides the Reviewer Validation tab when reviewer validation is disabled", async () => {
    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))

    expect(screen.getByText("Accessibility Summary")).toBeTruthy()
    expect(screen.queryByText("Reviewer Validation")).toBeNull()
  })

  it("shows the Reviewer Validation tab when reviewer validation is enabled", async () => {
    reviewerCatalogMock.mockReturnValue({ data: { enabled: true }, isLoading: false, error: null })
    useSearchMock.mockReturnValue({ tab: "reviewer-validation" })

    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))

    expect(screen.getByText("Reviewer Validation")).toBeTruthy()
  })

  it("exits loading state after async package task completes", async () => {
    packageAdtMock.mockResolvedValue({ status: "submitted", label: "demo-book", taskId: "task-1" })
    getTaskMock.mockImplementation((taskId: string) => {
      if (taskId !== "task-1") return undefined
      return { taskId: "task-1", kind: "package-adt", status: "completed", description: "Packaging" }
    })

    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))
    await waitFor(() => expect(screen.getByText("Accessibility Summary")).toBeTruthy())

    expect(screen.getByText(/accessibility-summary:demo-book/)).toBeTruthy()
  })

  it("warns when the bundle it validates is missing content", async () => {
    // Validation reports on the packaged bundle, so it has to repeat what
    // packaging left out — a clean validation over a short bundle reads as
    // "the book is fine".
    packageAdtMock.mockResolvedValue({
      status: "completed",
      label: "demo-book",
      warnings: [{ kind: "orphaned-rendering", pageId: "pg002", sectionIndex: 1 }],
    } as never)

    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(warningToastMock).toHaveBeenCalledTimes(1))
    expect(String(warningToastMock.mock.calls[0][0])).toContain("pg002")
  })

  it("stays quiet when packaging left nothing out", async () => {
    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))
    expect(warningToastMock).not.toHaveBeenCalled()
  })
})
