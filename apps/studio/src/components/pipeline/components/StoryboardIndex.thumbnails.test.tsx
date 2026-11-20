// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
const mocks = vi.hoisted(() => ({
  image: vi.fn(),
  pages: [{ pageId: "pg001", pageNumber: 1, hasRendering: true, renderingVersion: 3, sectionCount: 1,
    sections: [{ sectionId: "s1", sectionIndex: 0, textPreview: "First section", isPruned: false }] }],
}))
vi.mock("@lingui/react", () => ({ useLingui: () => ({ i18n: { _: () => "Section" } }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray) => s.join(""), plural: () => "comments" }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: () => ({
  getVirtualItems: () => mocks.pages.flatMap((p) => p.sections).map((_, index) => ({ index, start: index * 76, end: (index + 1) * 76 })),
  getTotalSize: () => 76, scrollToIndex: vi.fn(), measureElement: vi.fn(), scrollOffset: 0, scrollRect: { height: 200 },
}) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: mocks.pages }), usePageImage: mocks.image }))
vi.mock("@/hooks/use-books", () => ({ useBook: () => ({ data: { hasSourcePdf: true } }) }))
vi.mock("@/hooks/use-quizzes", () => ({ useQuizzes: () => ({}) }))
vi.mock("../stages/storyboard/components/feedback/use-book-comments", () => ({ useBookComments: () => ({ total: 0, bySection: new Map() }) }))
vi.mock("../stages/storyboard/components/feedback/use-comments-mode", () => ({ useCommentsMode: () => ({ on: false }) }))
import { StoryboardThumbnailProvider } from "./storyboard-thumbnails"
import { StoryboardIndex } from "./StoryboardIndex"
afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => {
  mocks.image.mockReset().mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false })
  mocks.pages[0].hasRendering = true
  mocks.pages[0].sections[0].isPruned = false
})
it("does not request the source PDF image for a rendered row until its comparison is open", () => {
  vi.useFakeTimers()
  render(<StoryboardIndex bookLabel="book" />)
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: false })
  fireEvent.mouseEnter(screen.getByRole("button"))
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: false })
  act(() => vi.advanceTimersByTime(800))
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: true })
  fireEvent.mouseLeave(screen.getAllByRole("button")[0])
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: false })
})
it("keeps the PDF fallback for pruned sections", () => {
  mocks.pages[0].sections[0].isPruned = true
  render(<StoryboardIndex bookLabel="book" />)
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: true })
  expect(document.querySelector('img[src*="screenshot"]')).toBeNull()
})

it("requests a PDF fallback when no rendering exists", () => {
  mocks.pages[0].hasRendering = false
  render(<StoryboardIndex bookLabel="book" />)
  expect(mocks.image).toHaveBeenLastCalledWith("book", "pg001", { enabled: true })
})

it.each(["fetching", "queued"])("does not describe %s hover images as missing", mode => {
 vi.useFakeTimers()
 mocks.image.mockReturnValue({isFetching:mode==="fetching",isLoading:false})
 const sidebar=<StoryboardIndex bookLabel="book" />
 render(mode==="queued"?<StoryboardThumbnailProvider scopeKey="book/page" waitForPreview>{sidebar}</StoryboardThumbnailProvider>:sidebar)
 fireEvent.mouseEnter(screen.getByRole("button"));act(()=>vi.advanceTimersByTime(800))
 expect(screen.getByText("Source PDF")).toBeTruthy()
 expect(screen.queryByText("No source image")).toBeNull()
 expect(screen.queryByText("Not rendered yet")).toBeNull()
})
it("shows the existing source-image fallback after a settled failure", () => {
 vi.useFakeTimers();mocks.image.mockReturnValue({isFetching:false,isLoading:false,isError:true})
 render(<StoryboardIndex bookLabel="book" />)
 fireEvent.mouseEnter(screen.getByRole("button"));act(()=>vi.advanceTimersByTime(800))
 expect(screen.getByText("No source image")).toBeTruthy()
})
