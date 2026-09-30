// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const navigate = vi.fn()
const warning = vi.fn()
let page: { pageId: string; sectioningTree: { sections: unknown[] } | null } | undefined
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, useSearch: () => ({ sectionId: "retired", unrelated: "keep" }) }))
vi.mock("@/components/ui/sonner", () => ({ toast: { warning: (...args: unknown[]) => warning(...args) } }))
vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [{ pageId: "pg001", sectionCount: 1 }], isLoading: false }),
  usePage: () => ({ data: page, isLoading: !page }),
}))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "done", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({}), useBookStructuredTextAvailability: () => true }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: vi.fn(), setOnLabelClick: vi.fn() }) }))
vi.mock("../../components/floating-save", () => ({ useFloatingSaveDirtyEntries: () => [] }))
vi.mock("./SectioningPageDetail", () => ({ SectioningPageDetail: () => <div>detail</div> }))
vi.mock("../storyboard/components/SectioningOverview", () => ({ SectioningOverview: () => <div>overview</div> }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => <div>run</div> }))
vi.mock("../../components/LoadingState", () => ({ LoadingState: () => <div>loading</div> }))
vi.mock("../../components/StageEmptyState", () => ({ StageEmptyState: () => <div>empty</div> }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), "") }),
}))
beforeEach(() => { vi.clearAllMocks(); page = undefined })
afterEach(cleanup)

it.each([null, { sections: [] }])("consumes a vanished target after load, including an empty sectioning result %j", async (sectioningTree) => {
  const { SectioningView } = await import("./SectioningView")
  const view = render(<SectioningView bookLabel="book" selectedPageId="pg001" />)
  expect(warning).not.toHaveBeenCalled()
  page = { pageId: "pg001", sectioningTree }
  view.rerender(<SectioningView bookLabel="book" selectedPageId="pg001" />)
  expect(warning).toHaveBeenCalledTimes(1)
  expect(navigate.mock.calls[0][0].search({ sectionId: "retired", unrelated: "keep" })).toEqual({ sectionId: undefined, unrelated: "keep" })
  expect(navigate.mock.calls[0][0]).toMatchObject({ replace: true, hash: true })
  view.rerender(<SectioningView bookLabel="book" selectedPageId="pg001" />)
  expect(warning).toHaveBeenCalledTimes(1)
})
