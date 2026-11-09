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
  useLingui: () => ({ t: join, i18n: { locale: "en", _: (d: {message: string}) => d.message } }),
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: undefined }) }))
vi.mock("@/hooks/use-stage-status", () => ({ useStageStatus: () => ({ isRunning: false }) }))
vi.mock("../../components/floating-save", () => ({ useFloatingSave: (entry: {onSave?: () => void | Promise<void>; onSaveStay?: () => Promise<void>}) => { if (entry.onSave) state.save = entry.onSave; if (entry.onSaveStay) state.stay = entry.onSaveStay }, useFloatingSaveDirtyEntries: () => [], PendingChip: ({children}: {children: ReactNode}) => <>{children}</> }))
vi.mock("../../pipeline-i18n", () => ({ getStageLabelI18n: (value: string) => value }))
vi.mock("../../components/StepViewRouter", () => ({ useStepHeader: () => ({ setExtra: state.setExtra }) }))
vi.mock("./components/PageJumper", () => ({ PageJumper: () => null }))
vi.mock("./components/PageCover", () => ({ PageCover: () => null }))
vi.mock("../../components/PageLightbox", () => ({ PageLightbox: () => null }))
vi.mock("@/api/client", () => ({ BASE_URL: "", api: { getVersionHistory: vi.fn(), restoreVersion: vi.fn(), getEasyRead: vi.fn(), updateEasyRead: vi.fn(), getOutputs: vi.fn(), runStages: vi.fn(), reviewOutput: vi.fn() } }))

vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({message: join(strings, ...values)}) }))
vi.mock("@/components/ui/sonner", () => ({toast: {success: vi.fn(), error: vi.fn()}}))

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
  vi.mocked(api.getEasyRead).mockResolvedValue({ sourceSignature: "source", generatedAt: "2026-01-01T00:00:00.000Z", version: 2,
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


it.each(["success", "failure"])("blocks Easy Read edits during a real picker restore and preserves the correct %s state", async outcome => {
  const current = await api.getEasyRead("book")
  const restored = { ...current!, version: 1, blocks: current!.blocks.map(block => ({...block, entries: block.entries.map(item => ({...item, text: "Historical Easy Read"}))})) }
  vi.mocked(api.getVersionHistory).mockResolvedValue({ versions: [{version: 2, data: current}, {version: 1, data: restored}] })
  let finish!: () => void
  vi.mocked(api.restoreVersion).mockImplementation(() => new Promise((resolve, reject) => {
    finish = () => {
      if (outcome === "failure") reject(new Error("Restore failed"))
      else { vi.mocked(api.getEasyRead).mockResolvedValue(restored); resolve({node: "easy-read", itemId: "book", version: 1}) }
    }
  }))
  setup()
  fireEvent.change(await screen.findByLabelText("Easy Read text"), {target: {value: "Draft before restore"}})
  fireEvent.click(await screen.findByRole("button", {name: /^v\s*2$/}))
  fireEvent.click(await screen.findByRole("button", {name: /^v\s*1/}))
  await waitFor(() => expect(api.restoreVersion).toHaveBeenCalledTimes(1))
  const input = screen.getByLabelText("Easy Read text") as HTMLTextAreaElement
  expect(input.matches(":disabled") || !!input.closest("[inert]")).toBe(true)
  fireEvent.change(input, {target: {value: "Must not enter while restoring"}})
  expect(input.value).toBe("Draft before restore")
  await act(async () => { finish() })
  await waitFor(() => expect((screen.getByLabelText("Easy Read text") as HTMLTextAreaElement).matches(":disabled")).toBe(false))
  expect((screen.getByLabelText("Easy Read text") as HTMLTextAreaElement).value).toBe(outcome === "success" ? "Historical Easy Read" : "Draft before restore")
  fireEvent.change(screen.getByLabelText("Easy Read text"), {target: {value: "New edit after restore settles"}})
  vi.mocked(api.updateEasyRead).mockResolvedValue({version: 3})
  await act(async () => { await state.stay() })
  expect(api.updateEasyRead).toHaveBeenLastCalledWith("book", expect.objectContaining({baseVersion: outcome === "success" ? 1 : 2, sourceSignature: "source"}))
})
