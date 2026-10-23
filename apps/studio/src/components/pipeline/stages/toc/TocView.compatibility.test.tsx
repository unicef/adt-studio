// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const actions = vi.hoisted(() => ({ stay: async () => {}, dirty: false }))
const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join, i18n: { _: (d: { message: string }) => d.message } }) }))
const HeaderContext = createContext<{ setExtra: (extra: ReactNode) => void }>({ setExtra: () => {} })
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => useContext(HeaderContext) }))
const retainedToc = { version: 2, generatedAt: "fixture", entries: [{ id: "toc001", title: "My saved chapter", sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "chapter1", level: 1 }] }
vi.mock("@/hooks/use-toc", () => ({ useToc: () => ({ data: retainedToc, isLoading: false }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "idle", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isCompleted: false, isRunning: false }) }))
vi.mock("./TocLandingPage", () => ({ TocLandingPage: () => <div>TOC landing</div> }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "" }), useBookStructuredTextAvailability: () => false }))
vi.mock("../../components/StageRunCard", () => ({ StageRunCard: () => <div>Generate TOC</div> }))
vi.mock("../../components/floating-save", () => ({
  useFloatingSave: (entry: { onSaveStay: () => Promise<void>; dirty: boolean }) => { actions.stay = entry.onSaveStay; actions.dirty = entry.dirty },
  PendingChip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("./components/TocHintBanner", () => ({ TocHintBanner: () => null }))
vi.mock("@/api/client", () => ({ api: { getTocSections: vi.fn().mockResolvedValue([]), updateToc: vi.fn().mockResolvedValue({ version: 3 }), getVersionHistory: vi.fn(), restoreVersion: vi.fn() } }))
const { api } = await import("@/api/client")
const { TocIndex } = await import("./TocIndex")
function Harness() {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}><header>{extra}</header><TocIndex bookLabel="book" /></HeaderContext.Provider>
}
afterEach(cleanup)
it("keeps the retained TOC editable after its attempt resets, without credentials or regeneration", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  expect(screen.queryByText("Generate TOC")).toBeNull()
  expect(screen.queryByText("TOC landing")).toBeNull()
  const input = await screen.findByLabelText("Entry title")
  expect((input as HTMLInputElement).value).toBe("My saved chapter")
  await waitFor(() => expect(api.getTocSections).toHaveBeenCalledWith("book"))
  fireEvent.change(input, { target: { value: "My revised chapter" } })
  await act(async () => { await actions.stay() })
  await waitFor(() => expect(api.updateToc).toHaveBeenCalledWith("book", expect.objectContaining({ entries: [expect.objectContaining({ id: "toc001", title: "My revised chapter" })] })))
  client.clear()
})

it("keeps a rejected TOC save draft and blocks overlapping edits until it settles", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let fail!: () => void
  vi.mocked(api.updateToc).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("TOC save failed")) }))
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  fireEvent.change(await screen.findByLabelText("Entry title"), {target: {value: "Submitted TOC draft"}})
  let saved!: Promise<void>
  await act(async () => { saved = actions.stay(); void saved?.catch(() => {}) })
  const input = screen.getByLabelText("Entry title") as HTMLInputElement
  expect(input.matches(":disabled")).toBe(true)
  fireEvent.change(input, {target: {value: "Must not be accepted while saving"}})
  expect(input.value).toBe("Submitted TOC draft")
  await act(async () => { fail(); await expect(saved).rejects.toThrow("TOC save failed") })
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).value).toBe("Submitted TOC draft")
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).matches(":disabled")).toBe(false)
  expect(actions.dirty).toBe(true)
  expect(screen.getByRole("alert").textContent).toContain("TOC save failed")
  await act(async () => { await actions.stay() })
  expect(api.updateToc).toHaveBeenLastCalledWith("book", expect.objectContaining({entries: [expect.objectContaining({title: "Submitted TOC draft"})]}))
  client.clear()
})


it("keeps the exact TOC draft through a background version refresh and failed real picker restore", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let fail!: () => void
  vi.mocked(api.getVersionHistory).mockResolvedValue({ versions: [{version: 2, data: retainedToc}, {version: 1, data: retainedToc}] })
  vi.mocked(api.restoreVersion).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("Restore failed")) }))
  const tree = () => <QueryClientProvider client={client}><Harness /></QueryClientProvider>
  const view = render(tree())
  fireEvent.change(await screen.findByLabelText("Entry title"), {target: {value: "Manual TOC draft"}})
  fireEvent.click(screen.getByRole("button", {name: /^v\s*2$/}))
  fireEvent.click(await screen.findByRole("button", {name: /^v\s*1/}))
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).matches(":disabled")).toBe(true)
  retainedToc.version = 3
  view.rerender(tree())
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).value).toBe("Manual TOC draft")
  await act(async () => fail())
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).value).toBe("Manual TOC draft")
  expect(actions.dirty).toBe(true)
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).matches(":disabled")).toBe(false)
  retainedToc.version = 2
  client.clear()
})
