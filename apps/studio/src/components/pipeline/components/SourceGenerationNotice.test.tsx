// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const state = vi.hoisted(() => ({ stages: ["toc"], running: false, cancelling: false, dirty: false, provider: true, queue: vi.fn(), keep: vi.fn(), status: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ sourceUpdateStages: state.stages, isRunning: state.running, isCancelling: state.cancelling, queueRun: state.queue }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-key" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("./floating-save", () => ({ useHasUnsavedChanges: () => state.dirty }))
vi.mock("@/api/client", () => ({ api: { keepSourceGeneration: state.keep, getStepStatus: state.status } }))
vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage }))
import { SourceGenerationNotice } from "./SourceGenerationNotice"
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const notice = (stage: string) => <QueryClientProvider client={client}><SourceGenerationNotice bookLabel="book" stage={stage} /></QueryClientProvider>
beforeEach(() => { client.clear(); state.status.mockReset().mockResolvedValue({ protectedWork: [] }); state.stages = ["toc"]; state.running = false; state.cancelling = false; state.dirty = false; state.provider = true; state.queue.mockClear(); state.keep.mockReset().mockResolvedValue({ stage: "toc", step: "toc-generation", inputSignature: "sig" }) })
afterEach(cleanup)
it.each(["quizzes", "glossary", "toc"])("offers an explicit stage-only Re-run above retained %s content", async stage => {
  state.stages = [stage]
  render(<QueryClientProvider client={client}><SourceGenerationNotice bookLabel="book" stage={stage} /><p>Retained content</p></QueryClientProvider>)
  expect(screen.getByRole("status").textContent).toContain("Generated before your latest edits")
  expect(screen.getByText("Retained content")).toBeTruthy()
  expect(state.queue).not.toHaveBeenCalled()
  await waitFor(() => expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: stage, toStage: stage, apiKey: "test-key", viewAfter: true })
})
it.each(["quizzes", "glossary", "toc"])("keeps retained %s content as current without a provider or generation", async stage => {
  state.stages = [stage]; state.provider = false
  render(notice(stage))
  expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(true)
  const keep = screen.getByRole("button", { name: "Keep existing content" }) as HTMLButtonElement
  expect(keep.disabled).toBe(false)
  fireEvent.click(keep)
  await waitFor(() => expect(state.keep).toHaveBeenCalledExactlyOnceWith("book", stage))
  expect(state.queue).not.toHaveBeenCalled()
})
it.each(["running", "cancelling", "dirty"] as const)("keeps the warning and blocks both actions during %s", condition => {
  state[condition] = true
  render(notice("toc"))
  for (const name of ["Re-run", "Keep existing content"]) {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
  }
  expect(state.queue).not.toHaveBeenCalled()
  expect(state.keep).not.toHaveBeenCalled()
  expect(screen.getByRole("status")).toBeTruthy()
})
it("keeps the warning across active-run transitions, removing it only when the persisted update state clears", async () => {
  const view = render(notice("toc"))
  state.running = true; view.rerender(notice("toc"))
  expect(screen.getByRole("status")).toBeTruthy()
  state.running = false; view.rerender(notice("toc"))
  await waitFor(() => expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  state.stages = []; view.rerender(notice("toc"))
  expect(screen.queryByRole("status")).toBeNull()
})
it("does not show a source generator warning on another stage", () => {
  render(notice("speech"))
  expect(screen.queryByRole("status")).toBeNull()
})

it("requires explicit confirmation of the protected TOC version and retains that scope across refetch", async () => {
  state.status.mockResolvedValue({ protectedWork: [{ node: "toc-generation", itemId: "book", version: 2, source: "manual" }] })
  render(notice("toc"))
  const rerun = screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement
  await waitFor(() => expect(rerun.disabled).toBe(false))
  fireEvent.click(rerun)
  expect(state.queue).not.toHaveBeenCalled()
  let dialog = screen.getByRole("dialog")
  expect(dialog.textContent).toContain("manually edited or legacy table of contents")
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
  expect(state.queue).not.toHaveBeenCalled()
  fireEvent.click(rerun)
  dialog = screen.getByRole("dialog")
  state.status.mockResolvedValue({ protectedWork: [{ node: "toc-generation", itemId: "book", version: 3, source: "manual" }] })
  await client.refetchQueries({ queryKey: ["books", "book", "step-status"] })
  fireEvent.click(within(dialog).getByRole("button", { name: "Re-run" }))
  expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: "toc", toStage: "toc", apiKey: "test-key", viewAfter: true, replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 2 }] })
})

it.each(["running", "cancelling", "dirty", "provider"] as const)("does not confirm replacement after %s availability changes", async condition => {
  state.status.mockResolvedValue({ protectedWork: [{ node: "toc-generation", itemId: "book", version: 4 }] })
  const view = render(notice("toc"))
  await waitFor(() => expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  state[condition] = condition !== "provider"
  view.rerender(notice("toc"))
  const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Re-run" }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.click(confirm)
  expect(state.queue).not.toHaveBeenCalled()
})
it("fails closed while TOC protection is unavailable without preventing Keep", async () => {
  state.status.mockRejectedValue(new Error("Unavailable"))
  render(notice("toc"))
  expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(true)
  await screen.findByText("Unavailable")
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  expect(state.queue).not.toHaveBeenCalled()
  expect((screen.getByRole("button", { name: "Keep existing content" }) as HTMLButtonElement).disabled).toBe(false)
})

it.each(["book", "stage"])("drops replacement consent when the %s scope changes", async change => {
  state.status.mockResolvedValue({ protectedWork: [{ node: "toc-generation", itemId: "book", version: 2 }] })
  const view = render(notice("toc"))
  await waitFor(() => expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Re-run" }))
  expect(screen.getByRole("dialog")).toBeTruthy()
  state.stages = ["toc", "quizzes"]
  view.rerender(<QueryClientProvider client={client}><SourceGenerationNotice bookLabel={change === "book" ? "other-book" : "book"} stage={change === "stage" ? "quizzes" : "toc"} /></QueryClientProvider>)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.queue).not.toHaveBeenCalled()
})
