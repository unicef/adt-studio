// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const state = vi.hoisted(() => ({ queue: vi.fn(), status: "idle", page: null as object | null, header: { setExtra: () => {}, setOnLabelClick: () => {} } }))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, i) => text + part + (values[i] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: interpolate }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queue, stageState: () => state.status, stepState: () => "idle", stepProgress: () => null, stepError: () => null, isCancelling: false, cancelRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-only" }), useBookStructuredTextAvailability: () => true }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: [{ pageId: "pg003", pageNumber: 3, sectionCount: 0 }] }), usePage: () => ({ data: state.page }) }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => state.header }))
vi.mock("./SectioningPageDetail", () => ({ SectioningPageDetail: () => null }))
vi.mock("../storyboard/components/SectioningOverview", () => ({ SectioningOverview: () => null }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (s: string) => s, getStageRunningLabelI18n: (s: string) => s, getStageDescriptionI18n: () => "", getStepLabelI18n: (s: string) => s }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn() } }))
const { api } = await import("@/api/client")
const { SectioningView } = await import("./SectioningView")
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks(); state.status = "idle"; state.page = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: [{ node: "page-sectioning", itemId: "pg003", version: 9, pageNumber: 3 }] } as never)
})
afterEach(() => { cleanup(); client.clear() })
it.each(["stage", "missing-page"])("the %s Sectioning run card names protected pages and keeps replacement off", async entry => {
  if (entry === "missing-page") { state.status = "done"; state.page = { sectioningTree: null } }
  render(<QueryClientProvider client={client}><SectioningView bookLabel="book" selectedPageId="pg003" /></QueryClientProvider>)
  const button = screen.getByRole("button", { name: entry === "stage" ? /Run sectioning/ : /Re-run sectioning/ })
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(button)
  expect(await screen.findByText(/Pages with manual edits or unknown authorship:/)).toHaveProperty("textContent", expect.stringContaining("3"))
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(state.queue).not.toHaveBeenCalled()
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(button)
  fireEvent.click(await screen.findByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  await waitFor(() => expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: "sectioning", toStage: "sectioning", apiKey: "test-only", replaceManual: true, protectedReplacements: [{ node: "page-sectioning", itemId: "pg003", version: 9 }] }))
})

it("keeps an open confirmation reachable when a background update replaces the run card", async () => {
  const tree = () => <QueryClientProvider client={client}><SectioningView bookLabel="book" selectedPageId="pg003" /></QueryClientProvider>
  const view = render(tree())
  const run = screen.getByRole("button", { name: /Run sectioning/ }) as HTMLButtonElement
  await waitFor(() => expect(run.disabled).toBe(false))
  fireEvent.click(run); await screen.findByRole("dialog")
  state.status = "done"; state.page = { sectioningTree: { sections: [] } }
  view.rerender(tree())
  expect(screen.getByRole("dialog")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(state.queue).not.toHaveBeenCalled()
  state.status = "idle"; state.page = null; view.rerender(tree())
  const retry = screen.getByRole("button", { name: /Run sectioning/ }) as HTMLButtonElement
  await waitFor(() => expect(retry.disabled).toBe(false))
  fireEvent.click(retry); await screen.findByRole("dialog")
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  await waitFor(() => expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: "sectioning", toStage: "sectioning", apiKey: "test-only", replaceManual: false, protectedReplacements: [] }))
})
