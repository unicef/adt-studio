// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const state = vi.hoisted(() => ({ stages: ["toc"], running: false, cancelling: false, dirty: false, provider: true, queue: vi.fn(), keep: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ sourceUpdateStages: state.stages, isRunning: state.running, isCancelling: state.cancelling, queueRun: state.queue }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-key" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("./floating-save", () => ({ useHasUnsavedChanges: () => state.dirty }))
vi.mock("@/api/client", () => ({ api: { keepSourceGeneration: state.keep } }))
import { SourceGenerationNotice } from "./SourceGenerationNotice"
const client = new QueryClient()
const notice = (stage: string) => <QueryClientProvider client={client}><SourceGenerationNotice bookLabel="book" stage={stage} /></QueryClientProvider>
beforeEach(() => { state.stages = ["toc"]; state.running = false; state.cancelling = false; state.dirty = false; state.provider = true; state.queue.mockClear(); state.keep.mockReset().mockResolvedValue({ stage: "toc", step: "toc-generation", inputSignature: "sig" }) })
afterEach(cleanup)
it.each(["quizzes", "glossary", "toc"])("offers an explicit stage-only Re-run above retained %s content", stage => {
  state.stages = [stage]
  render(<QueryClientProvider client={client}><SourceGenerationNotice bookLabel="book" stage={stage} /><p>Retained content</p></QueryClientProvider>)
  expect(screen.getByRole("status").textContent).toContain("Generated before your latest edits")
  expect(screen.getByText("Retained content")).toBeTruthy()
  expect(state.queue).not.toHaveBeenCalled()
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
it("keeps the warning across active-run transitions, removing it only when the persisted update state clears", () => {
  const view = render(notice("toc"))
  state.running = true; view.rerender(notice("toc"))
  expect(screen.getByRole("status")).toBeTruthy()
  state.running = false; view.rerender(notice("toc"))
  expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(false)
  state.stages = []; view.rerender(notice("toc"))
  expect(screen.queryByRole("status")).toBeNull()
})
it("does not show a source generator warning on another stage", () => {
  render(notice("speech"))
  expect(screen.queryByRole("status")).toBeNull()
})
