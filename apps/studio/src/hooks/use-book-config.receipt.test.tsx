// Regression adapted from the final independent Codex review. Real config query/mutation hooks.
// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const state = vi.hoisted(() => ({
  config: { config: {} }, active: { merged: {} }, save: vi.fn(), queue: vi.fn(), navigate: vi.fn(), proceed: vi.fn(), reset: vi.fn(),
  blocked: false, running: false, provider: true, edits: vi.fn(),
}))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: interpolate, i18n: { _: (d: { id?: string }) => d.id ?? "" } }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings[0] }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate, useBlocker: () => ({ status: state.blocked ? "blocked" : "idle", proceed: state.proceed, reset: state.reset }) }))
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))


vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queue, isRunning: state.running }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-only" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/components/pipeline/settings-tabs", () => ({ getSettingsTabLabel: (_stage: string, tab: string) => tab }))
vi.mock("@/components/pipeline/components/PromptViewer", () => ({ PromptViewer: ({ onModelChange, maxRetries, onMaxRetriesChange }: { onModelChange: (value: string) => void; maxRetries: string; onMaxRetriesChange: (value: string) => void }) => <><button onClick={() => { state.edits(); onModelChange("fixture:new-model") }}>Change model</button><input aria-label="Retries" value={maxRetries} onChange={event => onMaxRetriesChange(event.target.value)} /></>, savePromptDraft: vi.fn(), toPromptDraft: vi.fn() }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn(), getBookConfig: vi.fn(), getActiveConfig: vi.fn(), getSectioningModeState: vi.fn(), getTasks: vi.fn(), updateBookConfigWithReceipt: vi.fn() } }))
const { i18n } = await import("@lingui/core")
i18n.load("en", {})
i18n.activate("en")
const { api } = await import("@/api/client")
const { TocSettings } = await import("@/components/pipeline/stages/toc/TocSettings")
const { SectioningSettings } = await import("@/components/pipeline/stages/sectioning/SectioningSettings")
const { FloatingSaveProvider } = await import("@/components/pipeline/components/floating-save")
const { UnsavedChangesGuard } = await import("@/components/pipeline/components/UnsavedChangesGuard")
const { SettingsDirtyTabsProvider } = await import("@/hooks/use-settings-dirty-tabs")
const { TooltipProvider } = await import("@/components/ui/tooltip")
let client: QueryClient
const record = (stage: string, version = 7) => ({ node: stage === "toc" ? "toc-generation" : "page-sectioning", itemId: stage === "toc" ? "book" : "pg003", version, pageNumber: 3 })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getTasks).mockResolvedValue({ tasks: [] } as never); vi.mocked(api.getSectioningModeState).mockResolvedValue({ effectiveMode: "dynamic", hasOutput: false } as never); state.config = { config: {} }; state.active = { merged: {} }; state.blocked = false; state.running = false; state.provider = true; state.save.mockResolvedValue({}); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }) })
afterEach(() => { cleanup(); client.clear() })
async function mount(stage: "toc" | "sectioning", editModel = true) {
  vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: [record(stage)] } as never)
  const tree = (book: string, tab = "sectioning-prompt") => <QueryClientProvider client={client}><TooltipProvider><SettingsDirtyTabsProvider><FloatingSaveProvider>
    {stage === "toc" ? <TocSettings bookLabel={book} /> : <SectioningSettings bookLabel={book} tab={tab} />}
    <UnsavedChangesGuard />
  </FloatingSaveProvider></SettingsDirtyTabsProvider></TooltipProvider></QueryClientProvider>
  const view = render(tree("a"))
  if (editModel) {
    fireEvent.click(screen.getAllByRole("button", { name: "Change model" })[0])
    await waitFor(() => expect((screen.getByRole("button", { name: "Save & Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  }
  return { show: (book = "a", tab = "sectioning-prompt") => view.rerender(tree(book, tab)) }
}
it.each((["toc", "sectioning"] as const).flatMap(stage => (["delayed", "failed", "cancelled", "obsolete"] as const).map(refresh => ({ stage, refresh }))))("$stage next Save retains acknowledged retry with $refresh reads", async ({ stage, refresh }) => {
  const key = stage === "toc" ? "toc_generation" : "page_sectioning"
  let saved = { [key]: { model: "fixture:old", max_retries: 3, mode: "dynamic" } }
  vi.mocked(api.getBookConfig).mockImplementation(async () => ({ config: saved }) as never)
  vi.mocked(api.getActiveConfig).mockImplementation(async () => ({ merged: saved }) as never)
  vi.mocked(api.updateBookConfigWithReceipt).mockImplementation(async (_label, config) => { saved = JSON.parse(JSON.stringify(config)); return { config: saved, activeConfig: { merged: saved, hasBookOverride: true } } as never })
  await mount(stage, false)
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Retries" }) as HTMLInputElement).value).toBe("3"))
  const lateBook = deferred<never>(), lateActive = deferred<never>()
  const oldBook = deferred<never>(), oldActive = deferred<never>()
  const oldSaved = structuredClone(saved)
  vi.mocked(api.getBookConfig).mockReturnValue(lateBook.promise)
  vi.mocked(api.getActiveConfig).mockReturnValue(lateActive.promise)
  if (refresh === "obsolete") {
    vi.mocked(api.getBookConfig).mockReturnValueOnce(oldBook.promise)
    vi.mocked(api.getActiveConfig).mockReturnValueOnce(oldActive.promise)
    void client.refetchQueries({ queryKey: ["book-config", "a"] })
    void client.refetchQueries({ queryKey: ["debug", "config", "a"] })
  }
  const retry = screen.getByRole("textbox", { name: "Retries" }) as HTMLInputElement
  expect(retry.matches(":disabled")).toBe(false)
  fireEvent.change(retry, { target: { value: "4" } })
  act(() => (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).click())
  await waitFor(() => expect(api.updateBookConfigWithReceipt).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(retry.matches(":disabled")).toBe(false))
  expect(saved[key].max_retries).toBe(4)
  if (refresh === "failed") await act(async () => { lateBook.reject(new Error("Read failed")); lateActive.reject(new Error("Read failed")) })
  if (refresh === "cancelled") await act(async () => { await client.cancelQueries({ queryKey: ["book-config", "a"] }); await client.cancelQueries({ queryKey: ["debug", "config", "a"] }) })
  if (refresh === "obsolete") await act(async () => { oldBook.resolve({ config: oldSaved } as never); oldActive.resolve({ merged: oldSaved } as never) })
  // A new edit is reachable after successful Save, while invalidation GETs wait.
  act(() => (screen.getByRole("button", { name: "Change model" }) as HTMLButtonElement).click())
  // Exercise the next Save & Re-run as well as the plain Save path.
  if (refresh === "obsolete") {
    fireEvent.click(screen.getByRole("button", { name: "Save & Re-run" }))
    const dialog = await screen.findByRole("dialog")
    if (stage === "sectioning") expect((within(dialog).getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
    fireEvent.click(within(dialog).getByRole("button", { name: "Re-run" }))
  } else act(() => (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).click())
  await waitFor(() => expect(api.updateBookConfigWithReceipt).toHaveBeenCalledTimes(2))
  const actual = vi.mocked(api.updateBookConfigWithReceipt).mock.calls[1][1]
  await act(async () => { lateBook.resolve({ config: saved } as never); lateActive.resolve({ merged: saved } as never) })
  expect(actual[key]).toMatchObject({ model: "fixture:new-model", max_retries: 4 })
  if (refresh === "obsolete") await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ fromStage: stage, replaceManual: stage === "toc" })))
  else expect(state.queue).not.toHaveBeenCalled()
})

it("Sectioning next Save retains the acknowledged map removal, independent addition and mode", async () => {
  let saved: Record<string, unknown> = {}
  let merged: Record<string, unknown> = { structure_types: { old: "Remove this type" }, page_sectioning: { mode: "dynamic", max_retries: 3 } }
  vi.mocked(api.getBookConfig).mockImplementation(async () => ({ config: saved }) as never)
  vi.mocked(api.getActiveConfig).mockImplementation(async () => ({ merged }) as never)
  vi.mocked(api.updateBookConfigWithReceipt).mockImplementation(async (_label, config) => {
    saved = JSON.parse(JSON.stringify(config))
    merged = { ...merged, ...saved, structure_types: Object.fromEntries(Object.entries(saved.structure_types as object).filter(([, value]) => value !== null)) }
    return { config: saved, activeConfig: { merged, hasBookOverride: true } } as never
  })
  const { show } = await mount("sectioning", false)
  show("a", "container-types")
  fireEvent.click(await screen.findByTitle("Remove type"))
  // An unrelated writer adds a type while this deletion is still a draft.
  merged = { ...merged, structure_types: { old: "Remove this type", independent: "Independent addition" } }
  await act(async () => { await client.invalidateQueries({ queryKey: ["debug", "config", "a"] }) })
  expect(await screen.findByDisplayValue("Independent addition")).toBeTruthy()
  show("a", "section-types")
  await waitFor(() => expect(screen.getByRole("radio", { name: /By Page/ }).getAttribute("data-disabled")).toBeNull())
  fireEvent.click(screen.getByRole("radio", { name: /By Page/ }))
  show("a", "sectioning-prompt")
  const lateBook = deferred<never>(), lateActive = deferred<never>()
  vi.mocked(api.getBookConfig).mockReturnValue(lateBook.promise)
  vi.mocked(api.getActiveConfig).mockReturnValue(lateActive.promise)
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updateBookConfigWithReceipt).toHaveBeenCalledTimes(1))
  await waitFor(() => expect((screen.getByRole("button", { name: "Change model" }) as HTMLButtonElement).matches(":disabled")).toBe(false))
  act(() => (screen.getByRole("button", { name: "Change model" }) as HTMLButtonElement).click())
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(api.updateBookConfigWithReceipt).toHaveBeenCalledTimes(2))
  expect(saved.structure_types).toEqual({ old: null, independent: "Independent addition" })
  expect(saved.page_sectioning).toMatchObject({ mode: "page", model: "fixture:new-model" })
  await act(async () => { lateBook.resolve({ config: saved } as never); lateActive.resolve({ merged } as never) })
  expect(state.queue).not.toHaveBeenCalled()
})
