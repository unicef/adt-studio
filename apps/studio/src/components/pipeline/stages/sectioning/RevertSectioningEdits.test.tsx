// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (parts: TemplateStringsArray, ...values: unknown[]) => parts.map((part, i) => part + (values[i] ?? "")).join("") }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
const { getVersionHistory, restoreVersion, success, error } = vi.hoisted(() => ({
  getVersionHistory: vi.fn(), restoreVersion: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
vi.mock("@/api/client", async (original) => ({
  ...await original<typeof import("@/api/client")>(),
  api: { getVersionHistory, restoreVersion },
}))
vi.mock("sonner", () => ({ toast: { success, error } }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => [] }))
vi.mock("../../components/CascadeResetDialog", () => ({
  CascadeResetDialog: ({ open, title, description, onConfirm, onOpenChange, confirmDisabledReason }: {
    open: boolean; title: React.ReactNode; description: React.ReactNode; onConfirm: () => void;
    onOpenChange: (open: boolean) => void; confirmDisabledReason?: string;
  }) => open ? <div role="dialog">{title}{description}
    <button onClick={onConfirm} disabled={!!confirmDisabledReason}>Confirm</button>
    <button onClick={() => onOpenChange(false)}>Cancel</button>
  </div> : null,
}))

import { RevertSectioningEdits } from "./RevertSectioningEdits"
import { ApiError } from "@/api/client"

let client: QueryClient
const busy = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  // Deliberately unordered, with a later AI version following a rollback.
  getVersionHistory.mockResolvedValue({ versions: [
    { version: 1, data: { source: "ai" } },
    { version: 5, data: { source: "ai" } },
    { version: 3, data: { source: "manual" } },
    { version: 2, data: { source: "ai" } },
    { version: 4, data: { source: "manual" } },
  ] })
  restoreVersion.mockResolvedValue({ version: 2 })
})
afterEach(() => { cleanup(); client.clear() })

function setup(disabledReason?: string) {
  return render(<QueryClientProvider client={client}>
    <RevertSectioningEdits bookLabel="book" pageId="pg005" pageNumber={5} currentVersion={4} disabledReason={disabledReason} onBusyChange={busy} />
  </QueryClientProvider>)
}
async function open() {
  const button = screen.getByRole("button", { name: "Revert manual edits" }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  fireEvent.click(button)
  return within(screen.getByRole("dialog"))
}

it("AC-12: cancels without a write, then restores only this page's nearest earlier AI version with a guard", async () => {
  setup()
  const dialog = await open()
  expect(screen.getByRole("dialog").textContent).toContain("page 5?")
  expect(screen.getByRole("dialog").textContent).toContain("Other pages keep their edits")
  fireEvent.click(dialog.getByText("Cancel"))
  expect(restoreVersion).not.toHaveBeenCalled()
  fireEvent.click((await open()).getByText("Confirm"))
  await waitFor(() => expect(success).toHaveBeenCalled())
  expect(getVersionHistory).toHaveBeenCalledWith("book", "page-sectioning", "pg005", true)
  expect(restoreVersion).toHaveBeenCalledExactlyOnceWith("book", "page-sectioning", "pg005", 2, 4)
  expect(busy.mock.calls).toEqual([[true], [false]])
})

it("AC-12: never guesses that legacy content or a later AI version is the original", async () => {
  getVersionHistory.mockResolvedValue({ versions: [
    { version: 1, data: {} }, { version: 3, data: { source: "manual" } }, { version: 5, data: { source: "ai" } },
  ] })
  setup()
  await screen.findByText("No earlier AI-generated version is available for this page.")
  expect((screen.getByRole("button", { name: "Revert manual edits" }) as HTMLButtonElement).disabled).toBe(true)
  expect(restoreVersion).not.toHaveBeenCalled()
})

it("AC-18: keeps unsaved drafts out of the restore flow", async () => {
  setup("Save or discard your edits first")
  await waitFor(() => expect(getVersionHistory).toHaveBeenCalled())
  const button = screen.getByRole("button", { name: "Revert manual edits" }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("AC-18: reports a stale/busy rejection without claiming edits were reverted", async () => {
  restoreVersion.mockRejectedValue(new ApiError("Conflict", 409))
  setup()
  fireEvent.click((await open()).getByText("Confirm"))
  await waitFor(() => expect(error).toHaveBeenCalledWith("This page changed or a run started. Your edits were kept. Try again."))
  expect(success).not.toHaveBeenCalled()
  await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false))
})

it("lets the user retry a failed history read without writing anything", async () => {
  getVersionHistory.mockRejectedValueOnce(new Error("offline"))
  setup()
  fireEvent.click(await screen.findByText("Could not load saved content. Retry"))
  await open()
  expect(restoreVersion).not.toHaveBeenCalled()
})
