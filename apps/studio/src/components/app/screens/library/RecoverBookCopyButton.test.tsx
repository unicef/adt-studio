// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, ApiError } from "@/api/client"
import { RecoverBookCopyButton } from "./RecoverBookCopyButton"

vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }) }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function mount(label = "original", reason: "book-busy" | "invalid-config" | "invalid-data" = "book-busy") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onOpen = vi.fn()
  render(<QueryClientProvider client={client}><RecoverBookCopyButton key={label} label={label} reason={reason} onOpen={onOpen} /></QueryClientProvider>)
  return onOpen
}
it.each(["invalid-config", "invalid-data"] as const)("does not offer copy recovery for %s", reason => {
  mount("original", reason)
  expect(screen.queryByRole("button", { name: "Recover a copy" })).toBeNull()
})
it("requires confirmation, creates one separate copy and opens only the returned copy", async () => {
  const recover = vi.spyOn(api, "recoverBookCopy").mockResolvedValue({ sourceLabel: "original", label: "recovered" })
  const onOpen = mount()
  fireEvent.click(screen.getByRole("button", { name: "Recover a copy" }))
  expect(recover).not.toHaveBeenCalled()
  const dialog = screen.getByRole("alertdialog")
  expect(dialog.textContent).toContain("original book and its lock evidence unchanged")
  fireEvent.click(within(dialog).getByRole("button", { name: "Recover a copy" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Open recovered copy" })).toBeTruthy())
  expect(recover).toHaveBeenCalledExactlyOnceWith("original", expect.stringMatching(/^original-recovered-/))
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Open recovered copy" }))
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("recovered")
})
it("keeps the confirmation open with a useful live-owner refusal and does not retry automatically", async () => {
  const recover = vi.spyOn(api, "recoverBookCopy").mockRejectedValue(new ApiError("busy", 409, "BOOK_BUSY"))
  mount()
  fireEvent.click(screen.getByRole("button", { name: "Recover a copy" }))
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recover a copy" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("cannot safely proceed"))
  expect(recover).toHaveBeenCalledTimes(1)
})


it.each(["Cancel", "Escape"])("returns focus to the recovery trigger on %s", async action => {
  mount()
  const trigger = screen.getByRole("button", { name: "Recover a copy" })
  trigger.focus(); fireEvent.click(trigger)
  if (action === "Cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  else fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
it("returns focus to Open recovered copy after success", async () => {
  vi.spyOn(api, "recoverBookCopy").mockResolvedValue({ sourceLabel: "original", label: "recovered" })
  mount(); fireEvent.click(screen.getByRole("button", { name: "Recover a copy" }))
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recover a copy" }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open recovered copy" })))
})
it.each([
  ["BOOK_RECOVERY_COPY_DESTINATION_EXISTS", "name is already in use"],
  ["BOOK_RECOVERY_COPY_NO_SPACE", "not enough disk space"],
  ["BOOK_RECOVERY_COPY_ACCESS_DENIED", "folder permissions"],
])("explains %s without claiming source corruption", async (code, explanation) => {
  vi.spyOn(api, "recoverBookCopy").mockRejectedValue(new ApiError("failure", 409, code))
  mount(); fireEvent.click(screen.getByRole("button", { name: "Recover a copy" }))
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recover a copy" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(explanation))
})
