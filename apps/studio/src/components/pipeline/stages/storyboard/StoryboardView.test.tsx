// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

const navigateMock = vi.fn()
const searchMock = vi.fn(() => ({ tab: "details", sectionId: "pg001_sec002" }))
const setSectionIndexMock = vi.fn()
const toastWarningMock = vi.fn()

const pages = [{ pageId: "pg001", pageNumber: 1, sectionCount: 2 }]
let page = {
  pageId: "pg001",
  sectioningTree: {
    sections: [
      { sectionId: "pg001_sec001", sectionType: "content", nodes: [] },
      { sectionId: "pg001_sec002", sectionType: "content", nodes: [] },
    ],
  },
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock(),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), "")
    },
  }),
}))

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: pages, isLoading: false }),
  usePage: () => ({ data: page, isLoading: false }),
}))

vi.mock("../../components/StepViewRouter", () => ({
  useStepHeader: () => ({ setExtra: vi.fn(), setOnLabelClick: vi.fn() }),
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    stageState: (stage: string) => stage === "storyboard" || stage === "sectioning" ? "done" : "idle",
    queueRun: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-api-key", () => ({
  useBookStructuredTextAvailability: () => true,
  useApiKey: () => ({ apiKey: "test-key", hasApiKey: true }),
}))

vi.mock("@/routes/books.$label", () => ({
  useSectionNav: () => ({
    sectionIndex: 0,
    setSectionIndex: setSectionIndexMock,
    skipNextResetRef: { current: false },
  }),
}))

vi.mock("../../components/floating-save", () => ({
  useHasUnsavedChanges: () => false,
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: { warning: toastWarningMock },
}))

vi.mock("./components/StoryboardSectionDetail", () => ({
  StoryboardSectionDetail: () => <div>storyboard-section</div>,
}))

vi.mock("./components/StoryboardQuizDetail", () => ({
  StoryboardQuizDetail: () => <div>storyboard-quiz</div>,
}))

vi.mock("./components/SectioningOverview", () => ({
  SectioningOverview: () => <div>sectioning-overview</div>,
}))

vi.mock("../../components/StageRunCard", () => ({
  StageRunCard: () => <div>stage-run</div>,
}))

vi.mock("../../components/LoadingState", () => ({
  LoadingState: () => <div>loading</div>,
}))

vi.mock("../../components/StageEmptyState", () => ({
  StageEmptyState: () => <div>empty</div>,
}))

beforeEach(() => {
  navigateMock.mockClear()
  setSectionIndexMock.mockClear()
  toastWarningMock.mockClear()
  searchMock.mockReturnValue({ tab: "details", sectionId: "pg001_sec002" })
})

afterEach(cleanup)

describe("StoryboardView validation section focus", () => {
  it("selects the stable section id and consumes only the one-shot search value", async () => {
    const { StoryboardView } = await import("./StoryboardView")
    const view = render(<StoryboardView bookLabel="demo-book" selectedPageId="pg001" />)

    await waitFor(() => expect(setSectionIndexMock).toHaveBeenCalledWith(1))
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "storyboard", pageId: "pg001" },
      search: expect.any(Function),
      hash: true,
      replace: true,
    })
    const updateSearch = navigateMock.mock.calls[0][0].search
    expect(updateSearch({ tab: "details", sectionId: "pg001_sec002", unrelated: "keep" }))
      .toEqual({ tab: "details", sectionId: undefined, unrelated: "keep" })
    view.rerender(<StoryboardView bookLabel="demo-book" selectedPageId="pg001" />)
    expect(setSectionIndexMock).toHaveBeenCalledTimes(1)
    expect(toastWarningMock).not.toHaveBeenCalled()
  })
  it("waits for data and never focuses a successor when the target disappears", async () => {
    const original = page
    page = { ...page, sectioningTree: null } as never
    const { StoryboardView } = await import("./StoryboardView")
    const view = render(<StoryboardView bookLabel="demo-book" selectedPageId="pg001" />)
    expect(setSectionIndexMock).not.toHaveBeenCalled()
    page = { ...original, sectioningTree: { sections: [original.sectioningTree.sections[0]] } }
    view.rerender(<StoryboardView bookLabel="demo-book" selectedPageId="pg001" />)
    await waitFor(() => expect(toastWarningMock).toHaveBeenCalled())
    expect(setSectionIndexMock).not.toHaveBeenCalled()
    page = original
  })

})

vi.mock("./components/BookOutlineAudit", () => ({ BookOutlineAudit: () => <div>outline</div> }))
