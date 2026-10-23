// @vitest-environment jsdom
import React, { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const translate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
const calls = vi.hoisted(() => ({ restore: vi.fn(), history: vi.fn(), restored: vi.fn(), portal: vi.fn() }))
vi.mock("@lingui/core/macro", () => ({ msg: (s: TemplateStringsArray, ...v: unknown[]) => ({ message: translate(s, ...v) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: translate, i18n: { locale: "en", _: (d: { message: string }) => d.message } }) }))
vi.mock("@/api/client", () => ({ api: { restoreVersion: calls.restore, getVersionHistory: calls.history } }))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("./floating-save", () => ({ useFloatingSave: () => {}, PendingChip: ({ children }: { children: ReactNode }) => <>{children}</> }))
const { VersionPicker } = await import("./VersionPicker")
const { useVersionRestoreBusy, EditorBusyBoundary } = await import("./version-restore")
const { TooltipProvider } = await import("@/components/ui/tooltip")
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  calls.history.mockResolvedValue({ versions: [{ version: 2, data: {} }, { version: 1, data: {} }] })
})
afterEach(() => { cleanup(); client?.clear() })

function Owner({ scope, book = "book" }: { scope: string; book?: string }) {
  const { restoring, restoringRef, onRestoringChange } = useVersionRestoreBusy(`${book}:${scope}`)
  const [draft, setDraft] = useState("")
  useEffect(() => setDraft(""), [scope, book])
  return <EditorBusyBoundary busy={restoring}>
    <input aria-label="Draft" value={draft} onChange={event => { if (!restoringRef.current) setDraft(event.target.value) }} />
    {createPortal(<button onClick={calls.portal}>Portal edit</button>, document.body)}
    <VersionPicker step="web-rendering" itemId="pg001" bookLabel={book} currentVersion={2}
      saving={restoring} dirty={!!draft} onRestoringChange={onRestoringChange}
      onRestored={() => { calls.restored(); setDraft("") }} onDiscard={() => setDraft("")} />
  </EditorBusyBoundary>
}
function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>
}
async function startRestore() {
  fireEvent.click(screen.getByRole("button", { name: /^v\s*2$/ }))
  fireEvent.click(await screen.findByRole("button", { name: /^v\s*1/ }))
  expect(calls.restore).toHaveBeenCalledTimes(1)
}

it("does not clear a new draft after same-page owner A to B to A while an old restore settles", async () => {
  let finish!: (value: object) => void
  calls.restore.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const view = render(<Owner scope="A" />, { wrapper: setup() })
  await startRestore()
  view.rerender(<Owner scope="B" />)
  view.rerender(<Owner scope="A" />)
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "New A draft" } })
  await act(async () => finish({ version: 1 }))
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("New A draft")
  expect(calls.restored).not.toHaveBeenCalled()
})

it.each(["owner change", "unmount"])("does not acknowledge a restore after %s", async change => {
  let finish!: (value: object) => void
  calls.restore.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const view = render(<Owner scope="A" />, { wrapper: setup() })
  await startRestore()
  if (change === "unmount") view.unmount()
  else view.rerender(<Owner scope="B" book="other" />)
  await act(async () => finish({ version: 1 }))
  expect(calls.restored).not.toHaveBeenCalled()
})

it("blocks portal controls and forced input during restore, retaining the old draft after rejection", async () => {
  let fail!: () => void
  calls.restore.mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("Failed restore")) }))
  render(<Owner scope="A" />, { wrapper: setup() })
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Keep this draft" } })
  await startRestore()
  const input = screen.getByLabelText("Draft") as HTMLInputElement
  expect(input.matches(":disabled")).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Portal edit" }))
  fireEvent.change(input, { target: { value: "Blocked new draft" } })
  expect(calls.portal).not.toHaveBeenCalled()
  expect(input.value).toBe("Keep this draft")
  await act(async () => fail())
  expect(input.matches(":disabled")).toBe(false)
  expect(input.value).toBe("Keep this draft")
  fireEvent.click(screen.getByRole("button", { name: "Portal edit" }))
  expect(calls.portal).toHaveBeenCalledTimes(1)
})

it.each(["success", "failure"])("ignores stale history %s after a book switch", async result => {
  let finish!: () => void
  calls.history.mockImplementationOnce(() => new Promise((resolve, reject) => {
    finish = () => result === "success"
      ? resolve({ versions: [{ version: 99, data: {} }] })
      : reject(new Error("Old book failed"))
  }))
  const view = render(<Owner scope="A" />, { wrapper: setup() })
  fireEvent.click(screen.getByRole("button", { name: /^v\s*2$/ }))
  view.rerender(<Owner scope="A" book="other" />)
  fireEvent.click(screen.getByRole("button", { name: /^v\s*2$/ }))
  expect(await screen.findByRole("button", { name: /^v\s*1/ })).toBeTruthy()
  await act(async () => finish())
  expect(screen.getByRole("button", { name: /^v\s*1/ })).toBeTruthy()
  expect(screen.queryByRole("button", { name: /^v\s*99/ })).toBeNull()
  expect(screen.queryByText(/Couldn't load/)).toBeNull()
})
