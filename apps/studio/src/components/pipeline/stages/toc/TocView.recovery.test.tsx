// @vitest-environment jsdom
import React, { createContext, useContext, useState, type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { TocGenerationOutput } from "@/api/client"

const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: join, i18n: { _: (d: { message: string }) => d.message } }) }))
const HeaderContext = createContext<{ setExtra: (extra: ReactNode) => void }>({ setExtra: () => {} })
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => useContext(HeaderContext) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ stageState: () => "done", queueRun: vi.fn() }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({}), useBookStructuredTextAvailability: () => false }))
const floating = vi.hoisted(() => ({ current: {} as { onSave?: () => Promise<void>; dirty?: boolean } }))
vi.mock("../../components/floating-save", () => ({ useFloatingSave: (value: typeof floating.current) => { floating.current = value }, PendingChip: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("./components/TocHintBanner", () => ({ TocHintBanner: () => null }))
vi.mock("@/api/client", async (original) => ({ ...await original<typeof import("@/api/client")>(), api: { getToc: vi.fn(), updateToc: vi.fn(), getTocSections: vi.fn() } }))
const { api, ApiError } = await import("@/api/client")
const { TocView } = await import("./TocView")
const entry = (id: string, chapter: string) => ({ id, title: `Chapter ${chapter}`, sectionId: `pg00${chapter === "A" ? 1 : 2}_sec001`, href: `${chapter}.html`, chapterId: chapter, level: 1 })
let response: TocGenerationOutput
let client: QueryClient
function Harness() {
  const [extra, setExtra] = useState<ReactNode>(null)
  return <HeaderContext.Provider value={{ setExtra }}><header>{extra}</header><TocView bookLabel="book" /></HeaderContext.Provider>
}
async function mountAndEdit() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  await screen.findByDisplayValue("Chapter A")
  fireEvent.click(screen.getAllByTitle("Increase indent")[0])
  await waitFor(() => expect(floating.current.dirty).toBe(true))
}
beforeEach(() => {
  vi.clearAllMocks()
  response = { entries: [entry("toc_001", "A"), entry("toc_002", "B")], pageCount: 2, generatedAt: "before", version: 1, source: "ai" }
  vi.mocked(api.getToc).mockImplementation(async () => structuredClone(response))
  vi.mocked(api.getTocSections).mockResolvedValue([])
  vi.mocked(api.updateToc).mockImplementation(async (_book, value) => {
    if (value.baseVersion !== response.version) throw new ApiError("Changed by another writer", 409)
    response = { ...value, version: response.version! + 1 }
    return { version: response.version! }
  })
})
afterEach(() => { cleanup(); client?.clear() })

it.each(["reorder", "insertion", "removal", "target", "replacement", "regenerated same targets", "regenerated identical entries", "duplicate IDs"])("F2: rejected Save preserves the whole draft when TOC identity changes through %s, and the next Save requires a choice", async (change) => {
  await mountAndEdit()
  const original = structuredClone(response)
  const updated = structuredClone(response)
  updated.version = 2
  if (change === "reorder") updated.entries.reverse()
  if (change === "insertion") updated.entries.unshift({ ...entry("toc_003", "C"), sectionId: "pg003_sec001" })
  if (change === "removal") updated.entries.shift()
  if (change === "target") updated.entries[0].sectionId = "pg003_sec001"
  if (change === "replacement") { updated.entries = [entry("toc_001", "B")]; updated.generatedAt = "replacement" }
  if (change === "regenerated same targets") { updated.generatedAt = "new-generation"; updated.entries[1].level = 2 }
  if (change === "regenerated identical entries") updated.generatedAt = "new-generation"
  if (change === "duplicate IDs") updated.entries[1].id = "toc_001"
  response = updated
  await act(async () => { await expect(floating.current.onSave!()).rejects.toThrow("Changed") })
  expect(screen.getByDisplayValue("Chapter A")).toBeTruthy()
  expect(screen.getByText("L2")).toBeTruthy()
  expect(screen.getByDisplayValue("Chapter A").matches(":disabled")).toBe(true)
  const count = vi.mocked(api.updateToc).mock.calls.length
  await act(async () => { await expect(floating.current.onSave!()).rejects.toThrow("Resolve conflicting edits") })
  expect(api.updateToc).toHaveBeenCalledTimes(count)
  fireEvent.click(screen.getByRole("button", { name: "Keep my changes" }))
  await act(async () => { await floating.current.onSave!() })
  expect(response.entries).toEqual([{ ...original.entries[0], level: 2 }, original.entries[1]])
  expect(vi.mocked(api.updateToc).mock.lastCall?.[1].baseVersion).toBe(2)
})

it("F2: an independent edit in another TOC entry survives recovery and the next Save", async () => {
  await mountAndEdit()
  response = { ...response, version: 2, entries: [response.entries[0], { ...response.entries[1], title: "Other writer's title" }] }
  await act(async () => { await expect(floating.current.onSave!()).rejects.toThrow("Changed") })
  expect(screen.queryByRole("button", { name: "Keep my changes" })).toBeNull()
  expect(screen.getByDisplayValue("Other writer's title")).toBeTruthy()
  await act(async () => { await floating.current.onSave!() })
  expect(response.entries[0]).toMatchObject({ title: "Chapter A", level: 2 })
  expect(response.entries[1].title).toBe("Other writer's title")
})

it("F2: loading the latest whole document explicitly discards the locked draft without rebasing it onto another chapter", async () => {
  await mountAndEdit()
  response = { ...response, version: 2, generatedAt: "replacement", entries: [entry("toc_001", "B")] }
  await act(async () => { await expect(floating.current.onSave!()).rejects.toThrow("Changed") })
  expect(screen.getByDisplayValue("Chapter A").matches(":disabled")).toBe(true)
  expect(screen.getByText("Discard this draft and load the entire latest saved table of contents.")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Load latest saved values" }))
  expect(screen.queryByDisplayValue("Chapter A")).toBeNull()
  expect(screen.getByDisplayValue("Chapter B").matches(":disabled")).toBe(false)
  await act(async () => { await floating.current.onSave!() })
  expect(response.entries).toEqual([entry("toc_001", "B")])
})

it("keeps ambiguous legacy TOCs readable with history available, but locks editing before a draft can change another chapter", async () => {
  response.entries[1].id = response.entries[0].id
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  expect((await screen.findByDisplayValue("Chapter A")).matches(":disabled")).toBe(true)
  expect(screen.getByDisplayValue("Chapter B").matches(":disabled")).toBe(true)
  expect(screen.getByText("This table of contents has conflicting chapter identities. Restore an earlier version before editing.")).toBeTruthy()
  expect(screen.getByRole("button", { name: /^v\s*1$/ }).matches(":disabled")).toBe(false)
  expect(api.updateToc).not.toHaveBeenCalled()
})
