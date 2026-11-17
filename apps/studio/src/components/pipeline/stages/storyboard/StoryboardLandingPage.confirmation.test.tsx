// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const state = vi.hoisted(() => ({ queue: vi.fn(), config: { merged: { render_strategies: {}, section_types: {} } }, completed: false, running: false, pages: [{ pageId: "pg003" }] }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((s, p, i) => s + p + (values[i] ?? ""), "") }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings[0] }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queue, isCancelling: false, cancelRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "fixture" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: (stage: string) => ({ isCompleted: stage === "sectioning" && state.completed, isRunning: state.running, hasError: false }) }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: state.pages, isPending: false, isFetching: false, isError: false }) }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => ({ data: { config: {} } }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: state.config }) }))
vi.mock("@/hooks/use-persist-config", () => ({ usePersistConfig: () => vi.fn() }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => [] }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage }))
vi.mock("@/components/pipeline/components/MissingKeyNotice", () => ({ MissingKeyNotice: () => null }))
vi.mock("@/components/parts/PartialMergeNotice", () => ({ PartialMergeNotice: () => null }))
vi.mock("./components/StoryboardPreview", () => ({ StoryboardPreview: () => null }))
vi.mock("./components/RenderStrategyVisual", () => ({ RenderStrategyVisual: () => null }))
vi.mock("@/components/pipeline/components/CascadeWarning", () => ({ CascadeWarning: () => null }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn() } }))
const { i18n } = await import("@lingui/core")
i18n.load("en", {}); i18n.activate("en")
const { api } = await import("@/api/client")
const { StoryboardLandingPage } = await import("./StoryboardLandingPage")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const protectedPage = { node: "page-sectioning", itemId: "pg003", version: 7, pageNumber: 3 }
let client: QueryClient
beforeEach(() => { vi.clearAllMocks(); state.completed = false; state.running = false; state.pages = [{ pageId: "pg003" }]; vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: [protectedPage] } as never); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }) })
afterEach(() => { cleanup(); client.clear() })
function mount() {
  const tree = (book: string) => <QueryClientProvider client={client}><TooltipProvider><StoryboardLandingPage bookLabel={book} /></TooltipProvider></QueryClientProvider>
  const view = render(tree("a")); return (book = "a") => view.rerender(tree(book))
}
async function open() {
  await waitFor(() => expect((screen.getByRole("button", { name: "Run Storyboard" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Run Storyboard" }))
  return screen.findByRole("dialog")
}
it("confirms the protected Sectioning in a restored book's combined run, default off and exact versions", async () => {
  mount()
  let dialog = await open()
  expect(within(dialog).getByText(/Pages with manual edits or unknown authorship/).textContent).toContain("3")
  fireEvent.click(within(dialog).getByRole("checkbox"))
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
  expect(state.queue).not.toHaveBeenCalled()
  dialog = await open()
  expect((within(dialog).getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(within(dialog).getByRole("button", { name: "Re-run" }))
  await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "sectioning", toStage: "storyboard", replaceManual: false, protectedReplacements: [] })))
  state.queue.mockClear()
  dialog = await open()
  fireEvent.click(within(dialog).getByRole("checkbox"))
  act(() => client.setQueryData(["books", "a", "step-status"], { protectedWork: [{ ...protectedPage, version: 8 }] }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Re-run" }))
  await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "sectioning", toStage: "storyboard", replaceManual: true, protectedReplacements: [{ node: "page-sectioning", itemId: "pg003", version: 7 }] })))
})
it.each(["book", "range"])("drops combined-run consent if its %s changes", async change => {
  const show = mount(); await open()
  if (change === "range") state.completed = true
  show(change === "book" ? "b" : "a")
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(state.queue).not.toHaveBeenCalled()
})
it("does not run on a failed protected-work read; ordinary Storyboard-only remains available", async () => {
  vi.mocked(api.getStepStatus).mockRejectedValue(new Error("Status unavailable"))
  const show = mount()
  await screen.findByText("Status unavailable")
  fireEvent.click(screen.getByRole("button", { name: "Run Storyboard" }))
  expect(state.queue).not.toHaveBeenCalled()
  state.completed = true; show()
  fireEvent.click(screen.getByRole("button", { name: "Run Storyboard" }))
  await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "storyboard", toStage: "storyboard" })))
})
