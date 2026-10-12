// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { TaskInfoResponse } from "@/api/client"
import { ApiError } from "@/api/client"
import { ValidationRepairAction } from "./ValidationRepairAction"

const server = vi.hoisted(() => ({ availability: vi.fn(), submit: vi.fn(), receipt: vi.fn(), cancel: vi.fn() }))
vi.mock("@/api/client", () => ({
  ApiError: class extends Error { constructor(message: string, readonly status: number) { super(message) } },
  api: { getValidationRepairAvailability: server.availability, submitValidationRepair: server.submit,
    getTaskRequest: server.receipt, cancelTask: server.cancel },
}))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), "") }) }))
let task: TaskInfoResponse | null, client: QueryClient
const target = { sectionId: "stable-9", finding: { kind: "violation" as const, assessmentVersion: 2, ruleId: "heading-order" } }
const open = vi.fn()
function view() { return render(<QueryClientProvider client={client}><ValidationRepairAction label="book" pageId="pg001" target={target} onOpenEditor={open} /></QueryClientProvider>) }
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); task = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  server.availability.mockResolvedValue({ available: true, reason: "ready", baseVersion: 3, renderingVersion: 5 })
  server.receipt.mockImplementation(async () => ({ task })); server.submit.mockResolvedValue({ taskId: "task-one" })
})
afterEach(() => { cleanup(); client.clear() })
async function confirm() {
  fireEvent.click(await screen.findByRole("button", { name: "Rerender section stable-9" }))
  expect(screen.getByRole("alertdialog").textContent).toContain("Provider calls may cost money")
  expect(server.submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Confirm rerender" }))
}
it("requires explicit cost confirmation, recovers a lost response and keeps one identity after remount", async () => {
  server.submit.mockRejectedValueOnce(new Error("Lost response"))
  const first = view(); await confirm()
  await screen.findByText(/response is uncertain/)
  const body = server.submit.mock.calls[0][2]
  expect(body).toMatchObject({ ...target, baseVersion: 3, renderingVersion: 5, requestId: expect.any(String) })
  first.unmount(); view()
  fireEvent.click(await screen.findByRole("button", { name: "Check or retry same request" }))
  await waitFor(() => expect(server.submit).toHaveBeenCalledTimes(2))
  expect(server.submit.mock.calls[1][2]).toEqual(body)
  task = { taskId: "task-one", kind: "re-render", status: "completed", description: "Rerender" }
  await client.invalidateQueries({ queryKey: ["task-request"] })
  await screen.findByText("Completed")
  expect(screen.getByText(/finding is unchanged/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Open task output in Storyboard" }))
  expect(open).toHaveBeenCalledTimes(1)
})
it("retains the finding on stale conflict, refreshes safely and requires another confirmation", async () => {
  server.submit.mockRejectedValueOnce(new ApiError("Stale version", 409)); view(); await confirm()
  await screen.findByText(/request was rejected/)
  fireEvent.click(screen.getByRole("button", { name: "Refresh current target" }))
  await screen.findByRole("button", { name: "Rerender section stable-9" })
  expect(server.submit).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled()
})
it("shows actual running/cancelled state and does not infer a passed finding", async () => {
  server.submit.mockImplementation(async () => { task = { taskId: "task-one", kind: "re-render", status: "running", description: "Rerender", cancellable: true }; return { taskId: task.taskId } })
  server.cancel.mockImplementation(async () => { task = { ...task!, status: "cancelled" }; return { status: "cancelling" } })
  view(); await confirm(); await screen.findByText("Running")
  fireEvent.click(screen.getByRole("button", { name: "Cancel task" }))
  await screen.findByText("Cancelled"); expect(screen.getByText(/finding is unchanged/)).toBeTruthy()
})
it("does not offer replacement for a protected target and explains editor navigation", async () => {
  server.availability.mockResolvedValue({ available: false, reason: "protected" }); view()
  await screen.findByText(/Manual, custom or unknown-origin/)
  expect(screen.queryByRole("button", { name: "Rerender section stable-9" })).toBeNull()
  expect(server.submit).not.toHaveBeenCalled()
})
it("a late response after navigation cannot submit another request or navigate", async () => {
  let resolve!: (value: { taskId: string }) => void
  server.submit.mockImplementation(() => new Promise((r) => { resolve = r }))
  const current = view(); await confirm(); current.unmount(); resolve({ taskId: "task-one" })
  await waitFor(() => expect(server.submit).toHaveBeenCalledTimes(1)); expect(open).not.toHaveBeenCalled()
})
