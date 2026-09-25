// @vitest-environment jsdom
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  state: { effectiveMode: "dynamic", hasOutput: true, stale: true },
  running: false,
  getState: vi.fn(), update: vi.fn(),
}))
vi.mock("@/api/client", () => ({ api: { getSectioningModeState: mocks.getState, updateBookConfig: mocks.update } }))
vi.mock("./use-book-run", () => ({ useBookRun: () => ({ isRunning: mocks.running }) }))
vi.mock("./use-book-tasks", () => ({ useBookTasks: () => ({ runningCount: 0 }) }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join(""), i18n: { _: (d: { id?: string }) => d?.id ?? "" } }),
}))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
const { useSectioningModeConfirmation } = await import("./use-sectioning-mode-confirmation")
const { useUpdateBookConfig } = await import("./use-book-config")

function Harness() {
  const mutation = useUpdateBookConfig()
  const confirmation = useSectioningModeConfirmation("book", mutation.isPending)
  return <>
    <span data-testid="persisted">{confirmation.state?.effectiveMode}</span>
    <button disabled={confirmation.busy} onClick={() => confirmation.request("page", () => mutation.mutate({ label: "book", config: { page_sectioning: { mode: "page" } } }))}>Select By Page</button>
    {mutation.error && <p role="alert">{mutation.error.message}</p>}
    {confirmation.dialog}
  </>
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  return { client, invalidate, view }
}
async function select() {
  await waitFor(() => expect((screen.getByRole("button", { name: "Select By Page" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Select By Page" }))
}
beforeEach(() => {
  mocks.running = false
  mocks.state = { effectiveMode: "dynamic", hasOutput: true, stale: true }
  mocks.getState.mockImplementation(async () => ({ ...mocks.state }))
  mocks.update.mockImplementation(async () => { mocks.state.effectiveMode = "page"; return { config: { page_sectioning: { mode: "page" } } } })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("Sectioning mode confirmation", () => {
  it("confirms retained stale output and cancels without a mutation", async () => {
    mount(); await select()
    expect(screen.getByText(/Saved versions are kept/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(mocks.update).not.toHaveBeenCalled()
    expect(screen.getByTestId("persisted").textContent).toBe("dynamic")
  })
  it("persists after confirmation and refreshes config, effective config, pages and status", async () => {
    const { invalidate } = mount(); await select()
    fireEvent.click(screen.getByRole("button", { name: "Change mode" }))
    await waitFor(() => expect(screen.getByTestId("persisted").textContent).toBe("page"))
    expect(mocks.update).toHaveBeenCalledTimes(1)
    for (const key of [["book-config", "book"], ["debug", "config", "book"], ["books", "book"]]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key })
    }
  })
  it("keeps/refetches persisted mode and surfaces a rejected save", async () => {
    mocks.update.mockRejectedValue(new Error("Book is busy"))
    mount(); await select()
    fireEvent.click(screen.getByRole("button", { name: "Change mode" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Book is busy"))
    expect(screen.getByTestId("persisted").textContent).toBe("dynamic")
    await waitFor(() => expect(mocks.getState.mock.calls.length).toBeGreaterThan(1))
  })
  it("requires no confirmation for a book without output and prevents duplicate pending saves", async () => {
    mocks.state.hasOutput = false
    let done!: () => void
    mocks.update.mockImplementation(() => new Promise<void>((resolve) => { done = resolve }))
    mount(); await select()
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect((screen.getByRole("button", { name: "Select By Page" }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(screen.getByRole("button", { name: "Select By Page" }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
    done()
  })
  it("disables mode changes while conflicting pipeline work is known", async () => {
    mocks.running = true
    mount()
    await waitFor(() => expect(screen.getByTestId("persisted").textContent).toBe("dynamic"))
    expect((screen.getByRole("button", { name: "Select By Page" }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
