// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ExtractRerunBlockedReason, ExtractRerunDiscards, ExtractRerunStatus } from "@adt/types"

const state = vi.hoisted(() => ({
  pages: [] as Array<{ pageId: string }>, provider: true, stage: "done",
  rerun: undefined as ExtractRerunStatus | undefined, discards: null as ExtractRerunDiscards | null,
  queueRun: vi.fn(), persist: vi.fn(),
  // Stable references: the page's effects depend on them.
  config: { data: { config: { start_page: 1, end_page: 2 } } }, book: { data: { title: "Raven", pageCount: 12 } }, pdf: { data: { pageCount: 12 }, isPending: false },
}))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: interpolate, i18n: { locale: "en", _: (d: { id: string }) => d.id } }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ id: interpolate(strings, ...values) }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <span>{children}</span>, useNavigate: () => vi.fn() }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({
  stageState: () => state.stage, queueRun: state.queueRun, isCancelling: false, cancelRun() {},
  extractRerun: state.rerun, extractRerunDiscards: state.discards,
}) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "fixture" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: state.pages }) }))
vi.mock("@/hooks/use-books", () => ({ useBook: () => state.book }))
vi.mock("@/hooks/use-source-pdf-info", () => ({ useSourcePdfInfo: () => state.pdf }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => state.config }))
vi.mock("@/hooks/use-persist-config", () => ({ usePersistConfig: () => state.persist }))
vi.mock("@/hooks/use-parts", () => ({ usePartInfo: () => ({ data: null }) }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => [] }))
vi.mock("@/components/parts/PartialMergeNotice", () => ({ PartialMergeNotice: () => null }))
vi.mock("@/components/wizard/shared/PreviewShell", () => ({ PreviewShell: () => null }))
vi.mock("@/components/pipeline/components/MissingKeyNotice", () => ({ MissingKeyNotice: () => null }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug, STAGE_LABEL_MESSAGES: {} }))
vi.mock("@/components/ui/range-slider", () => ({ RangeSlider: () => null }))
vi.mock("./components/ExtractPreview", () => ({ ExtractPreview: () => null }))
vi.mock("./components/PageGroupingVisual", () => ({ PageGroupingVisual: () => null }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn() } }))
const { ExtractLandingPage } = await import("./ExtractLandingPage")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const attemptId = "7b0e9d4c-52a1-4a43-9c0e-2f6f3f1f8a11"
const offers = (...actions: ExtractRerunStatus["actions"]): ExtractRerunStatus => ({ actions, attemptId, blockedReason: null })
const blockedBy = (blockedReason: ExtractRerunBlockedReason): ExtractRerunStatus => ({ actions: [], attemptId, blockedReason })
const twoPages = [{ pageId: "pg001" }, { pageId: "pg002" }]
let client: QueryClient
beforeEach(() => {
  Object.assign(state, { pages: twoPages, provider: true, stage: "done", rerun: offers("replace"), discards: { pages: 2, extractedImages: 7, addedImages: 1 } })
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The disabled button's tooltip is positioned with a ResizeObserver.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })
const mount = () => render(<QueryClientProvider client={client}><TooltipProvider><ExtractLandingPage bookLabel="book" /></TooltipProvider></QueryClientProvider>)
const runButton = () => screen.getByRole("button", { name: /^(Run Extract|Re-run)$/ }) as HTMLButtonElement
/** The shell hands the click to the page after its own (empty) run checks, asynchronously. */
const clickRun = async () => { await act(async () => { fireEvent.click(runButton()) }) }

it("RAC-23: Run on an extracted book asks before replacing and sends the replace request on confirm", async () => {
  mount()
  expect(runButton().disabled).toBe(false)
  expect(screen.queryByRole("dialog")).toBeNull()
  await clickRun()
  // One confirmation, the destructive one: no second re-run dialog beside it.
  const dialogs = await screen.findAllByRole("dialog")
  expect(dialogs).toHaveLength(1)
  expect(dialogs[0].textContent).toContain("Extract this book again?")
  expect(Object.fromEntries(within(dialogs[0]).getAllByRole("term").map(term => [term.textContent, term.nextElementSibling?.textContent]))).toMatchObject({
    "Extracted pages": "2", "Images taken from the PDF": "7", "Images added in Extract (crops, segments and uploads)": "1",
  })
  expect(state.queueRun).not.toHaveBeenCalled()
  fireEvent.click(within(dialogs[0]).getByRole("button", { name: "Discard and extract again" }))
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith({
    fromStage: "extract", toStage: "extract", apiKey: "fixture",
    extraction: { action: "replace", attemptId }, viewAfterStart: true,
  })
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("RAC-23: Cancel and Escape send nothing, and Cancel has the focus each time the dialog opens", async () => {
  mount()
  for (const dismiss of ["cancel", "escape"]) {
    await clickRun()
    const dialog = await screen.findByRole("dialog")
    const cancel = within(dialog).getByRole("button", { name: "Cancel" })
    expect(document.activeElement).toBe(cancel)
    if (dismiss === "cancel") fireEvent.click(cancel)
    else fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  }
  expect(state.queueRun).not.toHaveBeenCalled()
})

it("RAC-23: the confirmation stays bound to the extraction and counts it was opened for", async () => {
  const view = mount()
  await clickRun()
  await screen.findByRole("dialog")
  state.rerun = { ...offers("replace"), attemptId: "00000000-0000-4000-8000-000000000000" }
  state.discards = { pages: 9, extractedImages: 9, addedImages: 9 }
  view.rerender(<QueryClientProvider client={client}><TooltipProvider><ExtractLandingPage bookLabel="book" /></TooltipProvider></QueryClientProvider>)
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getAllByRole("term")[0].nextElementSibling?.textContent).toBe("2")
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard and extract again" }))
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ extraction: { action: "replace", attemptId } }))
})

it.each([
  ["downstream-output", "This book already has work from Sectioning or later stages, so Extract cannot run again on it. To extract again, create a new book from the PDF."],
  ["part-book", "This book is a part of a larger book. Its extraction is complete and stays fixed so the parts can be merged."],
  ["split-coordinator", "This book has been split into parts. Its extraction stays fixed so the parts can be merged back into it."],
  ["not-pdf-source", "This book was not created from a PDF, so there is nothing to extract again."],
  ["unrecognized-content", "Extract cannot run again on this book. To extract again, create a new book from the PDF."],
] as const)("RAC-24: Run stays disabled with the reason when nothing is offered (%s)", async (reason, text) => {
  state.rerun = blockedBy(reason)
  state.discards = null
  mount()
  expect(runButton().disabled).toBe(true)
  await clickRun()
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.queueRun).not.toHaveBeenCalled()
  // The reason is the tooltip of the disabled button.
  fireEvent.focus(runButton().closest("[tabindex]")!)
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
  expect(screen.queryByText(/not available in this version/)).toBeNull()
})

it("RAC-24: a book whose status is not known yet does not offer a run it cannot keep", () => {
  state.rerun = undefined
  mount()
  expect(runButton().disabled).toBe(true)
})

it.each([
  { action: "retry", pages: twoPages, stage: "error" },
  { action: "retry", pages: [], stage: "error" },
  { action: "resume", pages: twoPages, stage: "error" },
] as const)("RAC-24: Run sends $action for an unfinished extraction without a confirmation ($pages.length pages)", async ({ action, pages, stage }) => {
  Object.assign(state, { rerun: offers(action), pages: [...pages], stage, discards: null })
  mount()
  await clickRun()
  await waitFor(() => expect(state.queueRun).toHaveBeenCalled())
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith({
    fromStage: "extract", toStage: "extract", apiKey: "fixture", extraction: { action, attemptId }, viewAfterStart: true,
  })
})

it("a first extraction still runs without the field and without a confirmation", async () => {
  Object.assign(state, { rerun: { actions: [], attemptId: null, blockedReason: null }, pages: [], stage: "idle", discards: null })
  mount()
  await clickRun()
  await waitFor(() => expect(state.queueRun).toHaveBeenCalled())
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.queueRun).toHaveBeenCalledExactlyOnceWith({ fromStage: "extract", toStage: "extract", apiKey: "fixture", viewAfter: true })
})

it("needs a provider before any of it", async () => {
  state.provider = false
  mount()
  expect(runButton().disabled).toBe(true)
  await clickRun()
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.queueRun).not.toHaveBeenCalled()
})
