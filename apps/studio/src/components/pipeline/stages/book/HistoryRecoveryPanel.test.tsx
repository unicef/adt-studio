// @vitest-environment jsdom
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), repair: vi.fn(), checkpoint: vi.fn(), audit: vi.fn() }))
vi.mock("@/api/client", () => ({ api: { inspectHistoryRecovery: mocks.inspect, repairHistory: mocks.repair, checkpointHistory: mocks.checkpoint, getHistoryRecoveryAudit: mocks.audit } }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }) }))
const { HistoryRecoveryPanel } = await import("./HistoryRecoveryPanel")
const state = () => ({ snapshot: "a".repeat(64), bookId: "book", checkpointable: 0, revision: 0, issueCount: 1,
  issues: [{ node: "page-sectioning", itemId: "p1", version: 1, beforeHash: "damaged", witnessHash: "original", reason: "recoverable" }] })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.inspect.mockResolvedValue(state())
  mocks.repair.mockImplementation(async (_, request) => ({ requestId: request.requestId, count: 1, operation: "repair", revision: 1, replayed: false, selectedVersions: [] }))
})
afterEach(cleanup)
function mount(staleTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><HistoryRecoveryPanel bookLabel="A" /></QueryClientProvider>)
  return { client, view }
}
async function inspect() {
  fireEvent.click(screen.getByRole("button", { name: "Inspect history" }))
  await screen.findByRole("checkbox")
}
const repair = () => screen.getByRole("button", { name: "Restore verified history" }) as HTMLButtonElement

it("never inspects or mutates on opening, and Cancel requires fresh consent", async () => {
  mount(); expect(mocks.inspect).not.toHaveBeenCalled()
  await inspect(); expect(repair().disabled).toBe(true)
  fireEvent.click(screen.getByRole("checkbox")); expect(repair().disabled).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await inspect(); expect(repair().disabled).toBe(true)
  expect(mocks.repair).not.toHaveBeenCalled(); expect(mocks.checkpoint).not.toHaveBeenCalled()
})

it("binds confirmation to book identity even with identical version numbers and snapshots", async () => {
  const { client, view } = mount(); await inspect(); fireEvent.click(screen.getByRole("checkbox"))
  view.rerender(<QueryClientProvider client={client}><HistoryRecoveryPanel bookLabel="B" /></QueryClientProvider>)
  expect(screen.queryByRole("checkbox")).toBeNull()
  await inspect(); expect(repair().disabled).toBe(true)
  fireEvent.click(repair()); expect(mocks.repair).not.toHaveBeenCalled()
})

it("invalidates consent after a concurrent snapshot change and sends exact reviewed records", async () => {
  const { client } = mount(); await inspect(); fireEvent.click(screen.getByRole("checkbox"))
  client.setQueryData(["books", "A", "history-recovery"], { ...state(), snapshot: "b".repeat(64) })
  await waitFor(() => expect(repair().disabled).toBe(true))
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(repair())
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1))
  expect(mocks.repair.mock.calls[0]).toEqual(["A", { snapshot: "b".repeat(64), requestId: expect.any(String), confirmed: true,
    records: [{ node: "page-sectioning", itemId: "p1", version: 1, beforeHash: "damaged", witnessHash: "original" }] }])
  await waitFor(() => expect(mocks.inspect.mock.calls.length).toBeGreaterThan(1))
})

it("prevents duplicate pending writes and retries a lost response with the same request ID", async () => {
  let reject!: (error: Error) => void
  mocks.repair.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  mount(); await inspect(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(repair())
  await waitFor(() => expect(repair().disabled).toBe(true))
  fireEvent.click(repair()); expect(mocks.repair).toHaveBeenCalledTimes(1)
  reject(new Error("Response lost")); await screen.findByRole("alert")
  await waitFor(() => expect(repair().disabled).toBe(false))
  fireEvent.click(repair())
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(2))
  expect(mocks.repair.mock.calls[1]).toEqual(mocks.repair.mock.calls[0])
})

it("does not apply an A response or recovery evidence to B after navigation", async () => {
  let complete!: (value: unknown) => void
  mocks.repair.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const { client, view } = mount(); await inspect(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(repair())
  await waitFor(() => expect(complete).toBeDefined())
  view.rerender(<QueryClientProvider client={client}><HistoryRecoveryPanel bookLabel="B" /></QueryClientProvider>)
  complete({ requestId: "A", operation: "repair", count: 1, revision: 1, replayed: false, selectedVersions: [] })
  await inspect()
  expect(screen.queryByText(/Operation recorded/)).toBeNull()
  expect(repair().disabled).toBe(true)
})

it("offers a later readable-history checkpoint explicitly, never recovery for unverified history", async () => {
  mocks.inspect.mockResolvedValue({ ...state(), issues: [], issueCount: 0, checkpointable: 3 })
  mocks.checkpoint.mockResolvedValue({ operation: "checkpoint", count: 3, requestId: "checkpoint" })
  mount(); await inspect(); fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Save history checkpoint" }))
  await waitFor(() => expect(mocks.checkpoint).toHaveBeenCalledTimes(1))
  expect(mocks.repair).not.toHaveBeenCalled()
})


it("every explicit Inspect refreshes a fresh cache after Cancel and waits for new consent", async () => {
  mount(5 * 60 * 1000)
  await inspect()
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  let finish!: (value: unknown) => void
  mocks.inspect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole("button", { name: "Inspect history" }))
  await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(2))
  expect(repair().disabled).toBe(true)
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  finish({ ...state(), snapshot: "b".repeat(64) })
  await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false))
  expect(repair().disabled).toBe(true)
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(repair())
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1))
  expect(mocks.repair.mock.calls[0][1].snapshot).toBe("b".repeat(64))
})


it("Cancel aborts inspection and a late result cannot replace the next explicit inspection", async () => {
  mount(5 * 60 * 1000); await inspect()
  let late!: (value: unknown) => void
  mocks.inspect.mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
  fireEvent.click(screen.getByRole("button", { name: "Inspect history" }))
  await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(2))
  const signal = mocks.inspect.mock.calls[1][1] as AbortSignal
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(signal.aborted).toBe(true)
  mocks.inspect.mockResolvedValueOnce({ ...state(), snapshot: "b".repeat(64) })
  await inspect()
  await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(3))
  late({ ...state(), snapshot: "c".repeat(64) })
  await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(repair())
  await waitFor(() => expect(mocks.repair).toHaveBeenCalledTimes(1))
  expect(mocks.repair.mock.calls[0][1].snapshot).toBe("b".repeat(64))
})
