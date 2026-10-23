// @vitest-environment jsdom
import React, { useState, type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { OutputStatus } from "@adt/types"

const join = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
const state = vi.hoisted(() => ({ setExtra: (_extra: ReactNode) => {}, save: (() => undefined) as () => void | Promise<void>, stay: async () => {} }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ isRunning: false }) }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: join, i18n: { locale: "en" } }),
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("../../components/floating-save", () => ({ useFloatingSaveDirtyEntries: () => [] }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: state.setExtra }) }))
vi.mock("../../components/VersionPicker", () => ({ VersionPicker: ({ onSave, onSaveStay, dirty, saving }: { onSave: () => void | Promise<void>; onSaveStay: () => Promise<void>; dirty: boolean; saving: boolean }) => {
  state.save = onSave
  state.stay = onSaveStay
  return dirty ? <button disabled={saving} onClick={() => { void Promise.resolve(onSave()).catch(() => {}) }}>Save</button> : null
} }))
vi.mock("./components/PageJumper", () => ({ PageJumper: () => null }))
vi.mock("./components/PageCover", () => ({ PageCover: () => null }))
vi.mock("../../components/PageLightbox", () => ({ PageLightbox: () => null }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getEasyRead: vi.fn(), updateEasyRead: vi.fn(), getOutputs: vi.fn(), runStages: vi.fn(), reviewOutput: vi.fn() } }))

const { api } = await import("@/api/client")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { EasyReadEditor } = await import("./EasyReadEditor")
let client: QueryClient

const entry = { sourceId: "pg001_t001", easyReadId: "pg001_t001_easy_read", originalText: "The Nile floods every year.",
  text: "The river Nile floods each year.", pageId: "pg001", sectionId: "pg001_sec001", sectionIndex: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  state.setExtra = () => {}
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  vi.mocked(api.getEasyRead).mockResolvedValue({ sourceSignature: "source", generatedAt: "2026-01-01T00:00:00.000Z", version: 1,
    blocks: [{ pageId: "pg001", pageNumber: 1, sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "text", entries: [entry] }] } as never)
})
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals() })

function setup() {
  const output: OutputStatus = { identity: { kind: "easy-read", id: entry.easyReadId, language: "en" }, signature: "inputs", contentHash: "content",
    usable: true, current: false, protected: true, manual: true, excluded: false, missing: false, updateNeeded: false,
    warnings: [{ reason: "source-changed" }], pageIds: ["pg001"], sectionIds: ["pg001_sec001"] }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "book", "outputs", "summary"], { legacyBaselineRevision: 0, stages: {}, stagesWithoutMissing: {}, missingStages: [] })
  client.setQueryData(["books", "book", "outputs", false, undefined, 0], { outputs: [output] })
  function WithHeader() {
    const [extra, setExtra] = useState<ReactNode>(null)
    state.setExtra = setExtra
    return <>{extra}<EasyReadEditor bookLabel="book" isRunning={false} hasStructuredTextProvider onRegenerate={vi.fn()} /></>
  }
  render(<QueryClientProvider client={client}><TooltipProvider><WithHeader /></TooltipProvider></QueryClientProvider>)
}

it("retains a newer draft after a delayed save and submits it against the acknowledged version", async () => {
  let complete!: (value: { version: number }) => void
  vi.mocked(api.updateEasyRead).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  setup()
  const input = await screen.findByLabelText("Easy Read text")
  fireEvent.change(input, { target: { value: "First draft" } })
  fireEvent.click(await screen.findByRole("button", { name: "Save", exact: true }))
  await waitFor(() => expect(api.updateEasyRead).toHaveBeenCalledTimes(1))
  fireEvent.change(input, { target: { value: "Newer draft while saving" } })
  await act(async () => { complete({ version: 2 }) })
  expect((screen.getByLabelText("Easy Read text") as HTMLTextAreaElement).value).toBe("Newer draft while saving")
  vi.mocked(api.updateEasyRead).mockResolvedValueOnce({ version: 3 })
  fireEvent.click(await screen.findByRole("button", { name: "Save", exact: true }))
  await waitFor(() => expect(api.updateEasyRead).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.updateEasyRead).mock.calls[1][1]).toMatchObject({ baseVersion: 2, sourceSignature: "source", blocks: [{ entries: [{ text: "Newer draft while saving" }] }] })
})

it.each(["success", "conflict"])("the Save & leave callback waits for %s and preserves rejected drafts", async outcome => {
  let complete!: (value: { version: number }) => void
  let reject!: (error: Error) => void
  vi.mocked(api.updateEasyRead).mockImplementationOnce(() => new Promise((resolve, fail) => { complete = resolve; reject = fail }))
  setup()
  fireEvent.change(await screen.findByLabelText("Easy Read text"), { target: { value: "Pending save before leaving" } })
  await screen.findByRole("button", { name: "Save", exact: true })
  let settled = false
  let save!: Promise<void>
  await act(async () => {
    // This is the callback VersionPicker registers with the navigation guard.
    save = state.stay()
    void save.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve()
  })
  expect(api.updateEasyRead).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  if (outcome === "success") {
    await act(async () => { complete({ version: 2 }); await save })
    expect(settled).toBe(true)
    expect(screen.queryByRole("button", { name: "Save", exact: true })).toBeNull()
  } else {
    await act(async () => {
      reject(new Error("Version conflict: refresh before saving"))
      await expect(save).rejects.toThrow("Version conflict")
    })
    expect((screen.getByLabelText("Easy Read text") as HTMLTextAreaElement).value).toBe("Pending save before leaving")
    expect(await screen.findByText("Version conflict: refresh before saving")).toBeTruthy()
    expect(await screen.findByRole("button", { name: "Save", exact: true })).toBeTruthy()
  }
})

it("Save & leave rejects an in-flight save and a successor draft, then safely saves the successor", async () => {
  let complete!: (value: { version: number }) => void
  vi.mocked(api.updateEasyRead).mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValue({ version: 3 })
  setup()
  fireEvent.change(await screen.findByLabelText("Easy Read text"), { target: { value: "First draft" } })
  let saved!: Promise<void>
  await act(async () => { saved = state.stay(); void saved.catch(() => {}) })
  await act(async () => { await expect(state.stay()).rejects.toThrow("A save is still in progress") })
  expect(api.updateEasyRead).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText("Easy Read text"), { target: { value: "Successor draft" } })
  await act(async () => { complete({ version: 2 }); await expect(saved).rejects.toThrow("Newer edits are still unsaved") })
  expect((screen.getByLabelText("Easy Read text") as HTMLTextAreaElement).value).toBe("Successor draft")
  await act(async () => { await state.stay() })
  expect(vi.mocked(api.updateEasyRead).mock.calls[1][1]).toMatchObject({ baseVersion: 2, blocks: [{ entries: [{ text: "Successor draft" }] }] })
})

it("shows a protected Easy Read entry as a compact Manual edit pill with its actions in the popover", async () => {
  setup()
  const pill = await screen.findByRole("button", { name: "Easy Read: Edited manually" })
  // No inline callout: the reason and actions stay behind the pill.
  expect(screen.queryByText("Source changed. Your edit has been kept.")).toBeNull()
  fireEvent.click(pill)
  expect(screen.getByText("Source changed. Your edit has been kept.")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Keep my edit" })).toBeTruthy()
})

it("labels an entry that differs from its saved text as an unsaved edit", async () => {
  setup()
  fireEvent.change(await screen.findByLabelText("Easy Read text"), { target: { value: "The Nile floods once a year." } })
  expect(await screen.findByRole("button", { name: "Easy Read: Unsaved edit" })).toBeTruthy()
})

it("discloses that a shared edit also updates the section hidden by the page filter", async () => {
  vi.mocked(api.getEasyRead).mockResolvedValue({ sourceSignature: "source", generatedAt: "before", version: 1, blocks: [
    { pageId: "pg001", sectionId: "shared-section", sectionIndex: 0, sectionType: "text", entries: [entry] },
    { pageId: "pg002", sectionId: "shared-section", sectionIndex: 0, sectionType: "text", entries: [{ ...entry, pageId: "pg002", sectionId: "shared-section" }] },
  ] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["books", "book", "outputs", "summary"], { legacyBaselineRevision: 0, stages: {}, stagesWithoutMissing: {}, missingStages: [] })
  render(<QueryClientProvider client={client}><TooltipProvider>
    <EasyReadEditor bookLabel="book" selectedPageId="pg001" isRunning={false} hasStructuredTextProvider onRegenerate={vi.fn()} />
  </TooltipProvider></QueryClientProvider>)
  expect(await screen.findByText("This Easy Read text is shared across sections. Saving it updates every referring section, including sections outside the current filter.")).toBeTruthy()
  expect(screen.getAllByLabelText("Easy Read text")).toHaveLength(1)
})
