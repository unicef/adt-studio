// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  ids: ["pg001_sec002", "pg001_sec001"],
  detailIds: null as string[] | null,
  search: {} as { section?: number; sectionId?: string; comment?: string },
  comments: [{ id: "c1", page_section_id: "pg001_sec001", deleted_at: null }],
  dirty: false, pending: false,
  navigate: vi.fn(), open: vi.fn(), header: vi.fn(),
}))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: {children: React.ReactNode}) => <>{children}</>, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))
vi.mock("@tanstack/react-router", () => ({ useSearch: () => state.search, useNavigate: () => state.navigate }))
vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [{ pageId: "pg001", pageNumber: 1, hasRendering: true, sectionCount: state.ids.length, sections: state.ids.map((sectionId, sectionIndex) => ({ sectionId, sectionIndex })) }] }),
  usePage: () => ({ data: { pageId: "pg001", sectioningTree: { sections: (state.detailIds ?? state.ids).map(sectionId => ({ sectionId, nodes: [] })) }, rendering: { sections: [] }, versions: {} } }),
}))
vi.mock("@/hooks/use-publication-feedback", () => ({ usePublicationComments: () => ({ data: state.pending ? undefined : { comments: state.comments }, isPending: state.pending }) }))
vi.mock("./components/feedback/use-comments-mode", () => ({ useCommentsMode: () => ({ open: state.open }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "done", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({}), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-books", () => ({ useBook: () => ({ data: { workingSource: "pdf" } }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: state.header, setOnLabelClick: state.header }) }))
vi.mock("../../components/floating-save", () => ({ useHasUnsavedChanges: () => state.dirty }))
vi.mock("@/routes/books.$label", async () => {
  const { useState, useRef } = await import("react")
  return { useSectionNav: () => { const [sectionIndex, setSectionIndex] = useState(0); return { sectionIndex, setSectionIndex, skipNextResetRef: useRef(false) } } }
})
vi.mock("./components/StoryboardSectionDetail", () => ({ StoryboardSectionDetail: ({ sectionIndex, page }: {sectionIndex: number; page: {sectioningTree: {sections: {sectionId: string}[]}}}) => <div data-testid="editor-owner">{page.sectioningTree.sections[sectionIndex]?.sectionId}</div> }))
vi.mock("./components/StoryboardQuizDetail", () => ({ StoryboardQuizDetail: () => null }))
vi.mock("./components/SectioningOverview", () => ({ SectioningOverview: () => null }))
vi.mock("./components/BookOutlineAudit", () => ({ BookOutlineAudit: () => null }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => null }))
vi.mock("../../components/LoadingState", () => ({ LoadingState: () => <div>Loading</div> }))
import { StoryboardView } from "./StoryboardView"
afterEach(cleanup)
beforeEach(() => { state.detailIds = null; state.ids = ["pg001_sec002", "pg001_sec001"]; state.search = { section: 0, comment: "c1" }; state.comments = [{ id: "c1", page_section_id: "pg001_sec001", deleted_at: null }]; state.dirty = false; state.pending = false; state.open.mockClear(); state.navigate.mockClear() })
const view = () => <StoryboardView bookLabel="book" selectedPageId="pg001" />
it("opens an old ordinal comment link at its actual current owner after reordering", async () => {
  render(view())
  await waitFor(() => expect(screen.getByTestId("editor-owner").textContent).toBe("pg001_sec001"))
  expect(state.open).toHaveBeenCalledWith("c1", "pg001_sec001")
})
it("waits for the comment before opening anything and ignores a stale URL index", async () => {
  state.pending = true
  const mounted = render(view())
  expect(screen.queryByTestId("editor-owner")).toBeNull()
  state.ids = ["pg001_sec003", "pg001_sec002", "pg001_sec001"]
  state.pending = false; mounted.rerender(view())
  await waitFor(() => expect(screen.getByTestId("editor-owner").textContent).toBe("pg001_sec001"))
})
it("does not open a replacement for a retired ID and reconnects feedback after restore", async () => {
  state.ids = ["pg001_sec003"]
  const mounted = render(view())
  expect(screen.queryByTestId("editor-owner")).toBeNull()
  expect(screen.getByRole("status").textContent).toContain("unavailable")
  expect(state.open).not.toHaveBeenCalled()
  state.ids = ["pg001_sec003", "pg001_sec001"]; mounted.rerender(view())
  await waitFor(() => expect(screen.getByTestId("editor-owner").textContent).toBe("pg001_sec001"))
})
it.each([["pg001_sec001", "pg001_sec001"], ["", ""]])("does not resolve ambiguous or blank owners %j", (...ids) => {
  state.ids = ids as string[]
  render(view())
  expect(screen.queryByTestId("editor-owner")).toBeNull()
  expect(state.open).not.toHaveBeenCalled()
})
it("does not move a dirty editor when a feedback link arrives", () => {
  state.dirty = true
  render(view())
  expect(screen.getByTestId("editor-owner").textContent).toBe("pg001_sec002")
  expect(state.open).not.toHaveBeenCalled()
  expect(state.navigate).not.toHaveBeenCalled()
})

it("uses detail identity when its order differs from the summary response", async () => {
  state.ids = ["pg001_sec001", "pg001_sec002"]
  state.detailIds = ["pg001_sec002", "pg001_sec001"]
  render(view())
  await waitFor(() => expect(screen.getByTestId("editor-owner").textContent).toBe("pg001_sec001"))
})
it.each([["pg001_sec003"], ["pg001_sec001", "pg001_sec001"]])("does not trust a summary when current detail has retired or duplicated the owner %j", (...ids) => {
  state.detailIds = ids as string[]
  render(view())
  expect(screen.queryByTestId("editor-owner")).toBeNull()
  expect(state.open).not.toHaveBeenCalled()
})
