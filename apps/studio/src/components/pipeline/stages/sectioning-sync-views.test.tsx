// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { PageDetail } from "@/api/client"

const state = vi.hoisted(() => ({ page: null as PageDetail | null, stage: "done", sectioningStage: undefined as string | undefined, fixed: false,
  queueRun: vi.fn(), setExtra: vi.fn(), setOnLabelClick: vi.fn(), setSectionIndex: vi.fn(), skipNextResetRef: { current: false } }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.map((s, i) => s + (values[i] ?? "")).join("") }),
}))
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}), useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => <a href="/storyboard">{children}</a> }))
vi.mock("@/hooks/use-pages", () => ({
  usePage: () => ({ data: state.page, isLoading: false }),
  usePages: () => ({ data: [{ pageId: "pg001", pageNumber: 1, hasRendering: true, sectionCount: state.page?.sectioningTree?.sections.length ?? 0 }], isLoading: false }),
}))
vi.mock("../components/OutputReview", () => ({ OutputReview: () => null }))
vi.mock("../components/StepViewRouter", () => ({ useStepHeader: () => state }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: (stage: string) => stage === "sectioning" ? state.sectioningStage ?? state.stage : state.stage, queueRun: state.queueRun }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-fixed-layout", () => ({ useIsFixedLayout: () => state.fixed }))
vi.mock("@/routes/books.$label", () => ({ useSectionNav: () => ({ ...state, sectionIndex: 0 }) }))
vi.mock("../components/floating-save", () => ({ useHasUnsavedChanges: () => false, useFloatingSaveDirtyEntries: () => [] }))
vi.mock("../components/StageRunCard", () => ({ StageRunCard: () => <div>Existing stage run card</div> }))
vi.mock("./sectioning/SectioningPageDetail", () => ({ SectioningPageDetail: () => <div>Sectioning editor</div> }))
vi.mock("./storyboard/components/StoryboardSectionDetail", () => ({ StoryboardSectionDetail: () => <div>Storyboard editor</div> }))
vi.mock("./storyboard/components/StoryboardQuizDetail", () => ({ StoryboardQuizDetail: () => null }))
vi.mock("./storyboard/components/SectioningOverview", () => ({ SectioningOverview: () => null }))
vi.mock("./storyboard/components/BookOutlineAudit", () => ({ BookOutlineAudit: () => null }))

import { SectioningView } from "./sectioning/SectioningView"
import { StoryboardView } from "./storyboard/StoryboardView"

beforeEach(() => {
  state.stage = "done"
  state.sectioningStage = undefined
  state.fixed = false
  state.queueRun.mockClear()
  state.page = { pageId: "pg001", pageNumber: 1, sectioningTree: { reasoning: "empty", sections: [] },
    sectioningSynchronization: { sourceVersion: 2, renderingVersion: 1, layout: "reflowable", diagnostics: [],
      sections: [{ sectionId: "retired_sec007", status: "structural-drift", diagnostics: [] }] },
  } as unknown as PageDetail
})
afterEach(cleanup)

describe.each([{ label: "Sectioning", View: SectioningView }, { label: "Storyboard", View: StoryboardView }])("$label correspondence fallback", ({ View }) => {
  it.each(["empty", "invalid"])("shows persistent correspondence for an %s semantic tree", (kind) => {
    if (kind === "invalid") {
      state.page!.sectioningTree = null
      state.page!.sectioningSynchronization!.diagnostics = ["Invalid source"]
    }
    render(<View bookLabel="book" selectedPageId="pg001" />)
    expect(screen.getByRole("status").textContent).toContain("retired_sec007")
    expect(screen.queryByText(/Section not found/)).toBeNull()
  })

  it.each(["queued", "running", "error"])("does not hide unresolved correspondence when a task is %s", (stage) => {
    state.stage = stage
    render(<View bookLabel="book" selectedPageId="pg001" />)
    expect(screen.getByRole("status").textContent).toContain("retired_sec007")
    expect(screen.getByText("Existing stage run card")).toBeTruthy()
  })
})

describe("Storyboard stale banner compatibility", () => {
  it.each([true, false])("keeps the existing rerun recommendation only for reflowable books (fixed=%s)", (fixed) => {
    state.fixed = fixed
    state.stage = "idle"
    state.sectioningStage = "done"
    state.page!.sectioningTree!.sections = [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false, nodes: [] }]
    state.page!.sectioningSynchronization!.layout = fixed ? "fixed" : "reflowable"
    render(<StoryboardView bookLabel="book" selectedPageId="pg001" />)
    const rerun = screen.queryByRole("button", { name: "Re-run Storyboard" })
    if (fixed) {
      expect(rerun).toBeNull()
      expect(screen.queryByText(/Sectioning has changed since/)).toBeNull()
    } else {
      expect(rerun).toBeTruthy()
      fireEvent.click(rerun!)
      expect(state.queueRun).toHaveBeenCalledWith({ fromStage: "storyboard", toStage: "storyboard", apiKey: "test" })
    }
  })
})
