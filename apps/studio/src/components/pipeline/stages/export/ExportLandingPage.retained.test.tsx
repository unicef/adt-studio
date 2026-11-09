// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({
  ready: true,
  rendered: true,
  outputs: ["audio", "caption", "easy-read"].map((kind) => ({ identity: { kind }, usable: true })),
  startExport: vi.fn(),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }),
}))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle", isStatusLoading: false }) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [{ hasRendering: state.rendered }], isLoading: false }) }))
vi.mock("@/hooks/use-all-pages-pruned", () => ({ useAllPagesPruned: () => ({ allPruned: false, isLoading: false }) }))
vi.mock("@/hooks/use-parts", () => ({ usePartInfo: () => ({ data: null, isLoading: false }) }))
vi.mock("@/hooks/use-preview-settings-listener", () => ({ useCapturedPreviewSettings: () => undefined }))
vi.mock("@/hooks/use-export-watcher", () => ({ useExportWatcher: () => ({ startExport: state.startExport, isPreparing: false, error: null }) }))
vi.mock("@/hooks/use-outputs", () => ({ useOutputs: () => ({ data: { outputs: state.outputs }, isPending: !state.ready, isError: false }) }))
vi.mock("@/hooks/use-quizzes", () => ({ useQuizzes: () => ({ data: { quizzes: { quizzes: [{ quizId: "retained-quiz", source: "manual" }] } }, isPending: false, isError: false }) }))
vi.mock("@/hooks/use-glossary", () => ({ useGlossary: () => ({ data: { items: [{ id: "retained-term", source: "manual" }] }, isPending: false, isError: false }) }))
vi.mock("@/hooks/use-toc", () => ({ useToc: () => ({ data: { entries: [{ id: "toc1" }] }, isPending: false, isError: false }) }))
vi.mock("@/hooks/use-sign-language-videos", () => ({ useSignLanguageVideos: () => ({ data: { videos: [] }, isPending: false, isError: false }) }))
vi.mock("@/components/pipeline/components/LandingPageShell", () => ({ LandingPageShell: ({ canRun, onRun, children }: { canRun: boolean; onRun: () => void; children: React.ReactNode }) => <><button disabled={!canRun} onClick={onRun}>Open export</button>{children}</> }))
vi.mock("@/components/pipeline/components/StageBlockedState", () => ({ StageBlockedState: () => <p>No rendering</p> }))
vi.mock("./export-formats", () => ({ buildExportFormatConfig: () => ({ adt: { runLabel: "Export" } }) }))
vi.mock("./components/ExportPreview", () => ({ ExportPreview: () => null }))
vi.mock("./components/FormatPicker", () => ({ FormatPicker: () => null }))
vi.mock("./ExportDialog", () => ({ ExportDialog: ({ open, onConfirmExport }: { open: boolean; onConfirmExport: () => void }) => open ? <button onClick={onConfirmExport}>Confirm export</button> : null }))
const { ExportLandingPage } = await import("./ExportLandingPage")

afterEach(() => { cleanup(); state.startExport.mockClear(); state.ready = true; state.rendered = true })

it("exports retained quizzes, glossary and physical audio when all attempt statuses are idle", () => {
  render(<ExportLandingPage bookLabel="retained" />)
  fireEvent.click(screen.getByRole("button", { name: "Open export" }))
  fireEvent.click(screen.getByRole("button", { name: "Confirm export" }))
  expect(state.startExport).toHaveBeenCalledWith("adt", { quizzes: true, glossary: true, readAloud: true, signLanguage: false, languages: undefined }, undefined)
})

it("waits for saved-feature reads before offering an export that could omit protected output", () => {
  state.ready = false
  render(<ExportLandingPage bookLabel="retained" />)
  expect(screen.getByRole("button", { name: "Open export" }).matches(":disabled")).toBe(true)
  expect(state.startExport).not.toHaveBeenCalled()
})

it("does not offer previewable export when no rendering exists", () => {
  state.rendered = false
  render(<ExportLandingPage bookLabel="empty" />)
  expect(screen.getByText("No rendering")).toBeTruthy()
  expect(state.startExport).not.toHaveBeenCalled()
})

it("does not submit from an already-open dialog after saved-feature reads become unavailable", () => {
  const view = render(<ExportLandingPage bookLabel="retained" />)
  fireEvent.click(screen.getByRole("button", { name: "Open export" }))
  state.ready = false
  view.rerender(<ExportLandingPage bookLabel="retained" />)
  fireEvent.click(screen.getByRole("button", { name: "Confirm export" }))
  expect(state.startExport).not.toHaveBeenCalled()
})
