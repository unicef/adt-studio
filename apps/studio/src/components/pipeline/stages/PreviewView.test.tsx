// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const headerSlot = document.createElement("div")
document.body.appendChild(headerSlot)

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
}))

vi.mock("@lingui/react", () => ({ useLingui: () => ({ i18n: { _: (value: unknown) => String(value) } }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))

vi.mock("@/api/client", () => ({
  api: { packageAdt: () => Promise.resolve({ version: "1" }) },
  getAdtUrl: (label: string) => `/api/books/${label}/adt`,
}))

vi.mock("@/lib/packaging-warnings", () => ({ toastPackagingWarnings: () => {} }))
vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ stageState: () => "done", isStatusLoading: false }),
}))
vi.mock("@/hooks/use-book-tasks", () => ({
  useBookTasks: () => ({ isTaskRunning: () => false, getTask: () => undefined }),
}))
vi.mock("@/hooks/use-all-pages-pruned", () => ({ useAllPagesPruned: () => ({ allPruned: false, isLoading: false }) }))
vi.mock("@/hooks/use-debug", () => ({
  useAccessibilityAssessment: () => ({ data: undefined, isLoading: false, error: null }),
}))
vi.mock("@/hooks/use-books", () => ({ usePackageAdtStatus: () => ({ data: undefined }) }))
vi.mock("@/hooks/use-reviewer-validation", () => ({ useReviewerValidationCatalog: () => ({ data: { enabled: false } }) }))
vi.mock("@/components/debug/debug-panel-state", () => ({ useDebugPanelState: () => ({ panelOpen: false }) }))
vi.mock("@/components/pipeline/components/StepViewRouter", () => ({
  useStepHeader: () => ({ headerSlotEl: headerSlot }),
}))
vi.mock("./PreviewAccessibilityCard", () => ({ PreviewAccessibilityCard: () => null }))
vi.mock("./PreviewValidationCard", () => ({ PreviewValidationCard: () => null }))
vi.mock("./storyboard/components/style-editor/ViewportToggle", () => ({
  ViewportToggle: ({ onChange }: { onChange: (view: string) => void }) => (
    <>
      <button type="button" onClick={() => onChange("desktop")}>desktop</button>
      <button type="button" onClick={() => onChange("tablet")}>tablet</button>
      <button type="button" onClick={() => onChange("mobile")}>mobile</button>
    </>
  ),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function previewFrame(): HTMLIFrameElement {
  return screen.getByTitle("ADT Preview") as HTMLIFrameElement
}

function turnPreviewTo(path: string) {
  const frame = previewFrame()
  frame.contentWindow!.history.pushState({}, "", path)
  fireEvent.load(frame)
}

describe("PreviewView", () => {
  it("keeps the reader on the open page when the device changes", async () => {
    const { PreviewView } = await import("./PreviewView")
    render(<PreviewView bookLabel="demo" />)

    expect((await screen.findByTitle("ADT Preview")).getAttribute("src")).toBe("/api/books/demo/adt/v-1/")

    act(() => turnPreviewTo("/api/books/demo/adt/v-1/pg005_sec001.html"))

    fireEvent.click(screen.getByRole("button", { name: "tablet" }))
    expect(previewFrame().getAttribute("src")).toBe("/api/books/demo/adt/v-1/pg005_sec001.html")

    act(() => turnPreviewTo("/api/books/demo/adt/v-1/pg006_sec001.html"))

    fireEvent.click(screen.getByRole("button", { name: "mobile" }))
    expect(previewFrame().getAttribute("src")).toBe("/api/books/demo/adt/v-1/pg006_sec001.html")
  })
})
