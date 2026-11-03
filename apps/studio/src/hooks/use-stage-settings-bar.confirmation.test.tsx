// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { refreshRunStatus } from "./run-query-invalidation"

const state = vi.hoisted(() => ({
  config: { config: {} }, active: { merged: {} }, save: vi.fn(), queue: vi.fn(), navigate: vi.fn(), proceed: vi.fn(), reset: vi.fn(),
  blocked: false, running: false, provider: true, edits: vi.fn(),
}))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>, useLingui: () => ({ t: interpolate, i18n: { _: (d: { id?: string }) => d.id ?? "" } }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings[0] }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate, useBlocker: () => ({ status: state.blocked ? "blocked" : "idle", proceed: state.proceed, reset: state.reset }) }))
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => ({ data: state.config }), useUpdateBookConfig: () => ({ mutateAsync: state.save, isPending: false }), useBookConfigSaving: () => false }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => ({ data: state.active }) }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queue, isRunning: state.running }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-only" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/components/pipeline/settings-tabs", () => ({ getSettingsTabLabel: (_stage: string, tab: string) => tab }))
vi.mock("@/components/pipeline/components/PromptViewer", () => ({ PromptViewer: ({ onModelChange, maxRetries, onMaxRetriesChange }: { onModelChange: (value: string) => void; maxRetries: string; onMaxRetriesChange: (value: string) => void }) => <><button onClick={() => { state.edits(); onModelChange("fixture:new-model") }}>Change model</button><input aria-label="Retries" value={maxRetries} onChange={event => onMaxRetriesChange(event.target.value)} /></>, savePromptDraft: vi.fn(), toPromptDraft: vi.fn() }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn(), getSectioningModeState: vi.fn(), getTasks: vi.fn() } }))
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
const record = (stage: string, version = 7) => ({ node: stage === "toc" ? "toc-generation" : "page-sectioning", itemId: stage === "toc" ? "book" : "pg003", version, pageNumber: 3, ...(stage === "sectioning" ? { renderingVersion: 4, renderTreeVersion: 0, sectioningInputSignature: "a".repeat(64) } : {}) })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
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
async function open() {
  await waitFor(() => expect((screen.getByRole("button", { name: "Save & Re-run" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "Save & Re-run" }))
  return screen.findByRole("dialog")
}
async function confirm() { fireEvent.click(within(await screen.findByRole("dialog", { name: /Re-run/ })).getByRole("button", { name: "Re-run" })) }

it.each(["toc", "sectioning"] as const)("%s Settings names protected work before saving, cancels cleanly, and freezes confirmed versions", async stage => {
  await mount(stage)
  await open()
  expect(state.save).not.toHaveBeenCalled()
  expect(state.queue).not.toHaveBeenCalled()
  if (stage === "sectioning") expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  else expect(screen.getByText(/This replaces the manually edited/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(state.save).not.toHaveBeenCalled()
  await open()
  if (stage === "sectioning") fireEvent.click(screen.getByRole("checkbox"))
  await act(async () => { client.setQueryData(["books", "a", "step-status"], { protectedWork: [record(stage, 8)] }); await new Promise(resolve => setTimeout(resolve, 0)) })
  await confirm()
  await waitFor(() => expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: stage, toStage: stage, apiKey: "test-only", replaceManual: true, protectedReplacements: [(({ pageNumber: _, ...saved }) => saved)(record(stage))] }))
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.navigate).toHaveBeenCalledTimes(1)
})
it("Sectioning Settings keeps replacement off after each cancellation and allows ordinary generation", async () => {
  await mount("sectioning"); await open()
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await open()
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  await confirm()
  await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ replaceManual: false, protectedReplacements: [] })))
})
it.each(["toc", "sectioning"] as const)("%s Save and leave waits for confirmation and cancellation keeps settings unsaved", async stage => {
  const { show } = await mount(stage)
  state.blocked = true; show()
  const leave = await screen.findByRole("button", { name: /Save & re-run/i })
  fireEvent.click(leave)
  const dialog = await screen.findByRole("dialog", { name: /Re-run/ })
  expect(state.save).not.toHaveBeenCalled(); expect(state.proceed).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect((leave as HTMLButtonElement).disabled).toBe(false))
  expect(state.proceed).not.toHaveBeenCalled(); expect(state.queue).not.toHaveBeenCalled()
  fireEvent.click(leave); await confirm()
  await waitFor(() => expect(state.proceed).toHaveBeenCalledTimes(1))
  expect(state.save).toHaveBeenCalledTimes(1); expect(state.queue).toHaveBeenCalledTimes(1)
  expect(state.navigate).not.toHaveBeenCalled()
})
it.each(["toc", "sectioning"] as const)("%s failed settings Save leaves the draft and does not queue generation", async stage => {
  await mount(stage); state.save.mockRejectedValueOnce(new Error("Save failed"))
  await open(); await confirm()
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Save failed"))
  expect(state.queue).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled()
  await open(); await confirm()
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
})
it.each(["toc", "sectioning"] as const)("%s never reuses consent after an asynchronous Save crosses book scopes", async stage => {
  const { show } = await mount(stage)
  const saving = deferred<object>(); state.save.mockReturnValueOnce(saving.promise)
  await open(); await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  show("b"); show("a")
  await act(async () => saving.resolve({}))
  expect(state.queue).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled()
})
it("a cancelled fresh protection read cannot use cached empty protection to run", async () => {
  await mount("toc")
  client.setQueryData(["books", "a", "step-status"], { protectedWork: [] })
  const pending = deferred<never>(); vi.mocked(api.getStepStatus).mockReturnValueOnce(pending.promise)
  fireEvent.click(screen.getByRole("button", { name: "Save & Re-run" }))
  await waitFor(() => expect(api.getStepStatus).toHaveBeenCalledTimes(2))
  await act(async () => client.cancelQueries({ queryKey: ["books", "a", "step-status"] }))
  expect(state.queue).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled()
  await act(async () => pending.resolve({ protectedWork: [] } as never))
  expect(state.queue).not.toHaveBeenCalled()
  await open(); await confirm()
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
})
it("a background status fetch cannot replace or cancel the fresh protection read", async () => {
  await mount("sectioning")
  const background = deferred<never>(), fresh = deferred<never>()
  vi.mocked(api.getStepStatus).mockReturnValueOnce(fresh.promise)
  let backgroundRead!: Promise<unknown>
  act(() => {
    // Start between the last enabled render and its click handler: a real
    // QueryClient deduplicates calls under the same canonical status key.
    backgroundRead = client.fetchQuery({ queryKey: ["books", "a", "step-status"], staleTime: 0, queryFn: () => background.promise })
    fireEvent.click(screen.getByRole("button", { name: "Save & Re-run" }))
  })
  await waitFor(() => expect(api.getStepStatus).toHaveBeenCalledTimes(2))
  await act(async () => { background.resolve({ protectedWork: [record("sectioning", 4)] } as never); await backgroundRead })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.save).not.toHaveBeenCalled(); expect(state.queue).not.toHaveBeenCalled()
  await act(async () => refreshRunStatus(client, "a", false))
  await act(async () => fresh.resolve({ protectedWork: [record("sectioning", 11)] } as never))
  const dialog = await screen.findByRole("dialog")
  expect(dialog.textContent).toContain("Sectioning v11")
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  expect(client.getQueryCache().findAll({ queryKey: ["books", "a", "step-status"] })).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(state.save).not.toHaveBeenCalled(); expect(state.queue).not.toHaveBeenCalled()
})
it.each(["toc", "sectioning"] as const)("%s Save alone does not request consent or call generation", async stage => {
  await mount(stage)
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  expect(state.queue).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull()
})

it.each(["toc", "sectioning"] as const)("%s an old Save cannot clear the new book's settings draft", async stage => {
  const { show } = await mount(stage)
  const saving = deferred<object>(); state.save.mockReturnValueOnce(saving.promise)
  await open(); await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  show("b")
  fireEvent.click(screen.getAllByRole("button", { name: "Change model" })[0])
  await act(async () => saving.resolve({}))
  expect(state.queue).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled()
  const save = screen.getByRole("button", { name: "Save" })
  expect((save as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(save)
  await waitFor(() => expect(state.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ label: "b" })))
})

it.each(["toc", "sectioning"] as const)("%s pauses settings input during delayed protection reads and saves, then resumes after completion", async stage => {
  await mount(stage)
  const read = deferred<never>(); vi.mocked(api.getStepStatus).mockReturnValueOnce(read.promise)
  fireEvent.click(screen.getByRole("button", { name: "Save & Re-run" }))
  const input = screen.getAllByRole("button", { name: "Change model" })[0] as HTMLButtonElement
  expect(input.matches(":disabled")).toBe(true)
  expect(input.closest("fieldset")?.hasAttribute("inert")).toBe(true)
  // Native interaction respects the fieldset, unlike a synthetic change event.
  act(() => input.click())
  expect(state.edits).toHaveBeenCalledTimes(1)
  await act(async () => read.resolve({ protectedWork: [record(stage)] } as never))
  const saving = deferred<object>(); state.save.mockReturnValueOnce(saving.promise)
  await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  expect(input.matches(":disabled")).toBe(true)
  await act(async () => saving.resolve({}))
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
  expect(input.matches(":disabled")).toBe(false)
})


it.each(["toc", "sectioning"] as const)("%s retains a settings draft across a config refetch and saves its exact new values", async stage => {
  const key = stage === "toc" ? "toc_generation" : "page_sectioning"
  const { show } = await mount(stage)
  fireEvent.change(screen.getAllByRole("textbox", { name: "Retries" })[0], { target: { value: "4" } })
  state.active = { merged: { [key]: { model: "fixture:previous-model", max_retries: 3, mode: "page" } } }
  state.config = { config: { untouched: "latest independent setting" } }
  show()
  expect((screen.getAllByRole("textbox", { name: "Retries" })[0] as HTMLInputElement).value).toBe("4")
  await open()
  // A later read while consent is open must not change the captured draft.
  state.active = { merged: { [key]: { model: "fixture:third-model", max_retries: 2, mode: "page" } } }
  show()
  await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ label: "a", config: expect.objectContaining({
    untouched: "latest independent setting",
    [key]: expect.objectContaining({ model: "fixture:new-model", max_retries: 4, ...(stage === "sectioning" ? { mode: "page" } : {}) }),
  }) }))
  expect(state.queue).toHaveBeenCalledTimes(1)
})


it("Sectioning retains edited mode and type descriptions while accepting unrelated refreshed settings", async () => {
  state.active = { merged: { section_types: { text_only: "Original description" }, page_sectioning: { mode: "dynamic" } } }
  const { show } = await mount("sectioning")
  show("a", "section-types")
  fireEvent.click(screen.getByRole("radio", { name: /By Page/ }))
  fireEvent.change(screen.getByDisplayValue("Original description"), { target: { value: "My description" } })
  state.active = { merged: { section_types: { text_only: "External description", independent: "Added independently" }, page_sectioning: { mode: "dynamic", max_refinements: 2 } } }
  show("a", "section-types")
  expect(screen.getByRole("radio", { name: /By Page/ }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByDisplayValue("My description")).toBeTruthy()
  await open(); await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ label: "a", config: expect.objectContaining({
    section_types: { text_only: "My description", independent: "Added independently" },
    page_sectioning: expect.objectContaining({ mode: "page" }),
  }) }))
})


it.each(["toc", "sectioning"] as const)("%s retains early retry typing but adopts the untouched model and mode from a late initial read", async stage => {
  const key = stage === "toc" ? "toc_generation" : "page_sectioning"
  const { show } = await mount(stage, false)
  fireEvent.change(screen.getAllByRole("textbox", { name: "Retries" })[0], { target: { value: "4" } })
  state.active = { merged: { [key]: { model: "fixture:loaded-model", max_retries: 3, mode: "page" } } }
  show()
  await open()
  state.active = { merged: { [key]: { model: "fixture:refreshed-model", max_retries: 2, mode: "dynamic" } } }
  state.config = { config: { untouched: "arrived during confirmation" } }
  show()
  await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ label: "a", config: expect.objectContaining({
    untouched: "arrived during confirmation",
    [key]: expect.objectContaining({ model: "fixture:refreshed-model", max_retries: 4, ...(stage === "sectioning" ? { mode: "dynamic" } : {}) }),
  }) }))
})

it("Sectioning preserves an explicit type removal without deleting additions from repeated refetches", async () => {
  state.active = { merged: { structure_types: { old: "Remove this type" } } }
  const { show } = await mount("sectioning")
  show("a", "container-types")
  fireEvent.click(screen.getByTitle("Remove type"))
  for (const description of ["Independent addition", "Independent update"]) {
    state.active = { merged: { structure_types: { old: "Externally changed", independent: description } } }
    show("a", "container-types")
    expect(screen.queryByDisplayValue("Externally changed")).toBeNull()
    expect(screen.getByDisplayValue(description)).toBeTruthy()
  }
  await open(); await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ label: "a", config: expect.objectContaining({
    structure_types: { old: null, independent: "Independent update" },
  }) }))
})

it("Sectioning retains local selection changes and independently refreshed disabled types", async () => {
  state.active = { merged: { section_types: { custom: "Custom description" }, disabled_section_types: [] } }
  const { show } = await mount("sectioning")
  show("a", "section-types")
  fireEvent.click(screen.getByTitle("Disable type"))
  state.active = { merged: { section_types: { custom: "Custom description" }, disabled_section_types: ["independent"] } }
  show("a", "section-types")
  expect(screen.getByTitle("Re-enable type")).toBeTruthy()
  await open(); await confirm()
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  expect(state.save.mock.calls[0][0].config.disabled_section_types.sort()).toEqual(["custom", "independent"])
})


it.each(["cancel", "confirm"])("Sectioning Save requires fresh default-off replacement consent when configuration changes: %s", async action => {
  await mount("sectioning")
  const first = await open()
  fireEvent.click(within(first).getByRole("checkbox"))
  state.save.mockImplementation(async () => {
    vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: [{ ...record("sectioning", 8), sectioningInputSignature: "b".repeat(64) }] } as never)
  })
  await confirm()
  const second = await screen.findByText(/Settings were saved. Review replacement again/)
  const dialog = second.closest('[role="dialog"]') as HTMLElement
  expect((within(dialog).getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.queue).not.toHaveBeenCalled()
  if (action === "cancel") {
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(state.queue).not.toHaveBeenCalled()
  } else {
    fireEvent.click(within(dialog).getByRole("checkbox"))
    fireEvent.click(within(dialog).getByRole("button", { name: "Re-run" }))
    await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ replaceManual: true,
      protectedReplacements: [expect.objectContaining({ version: 8, sectioningInputSignature: "b".repeat(64) })] })))
  }
})

it("Sectioning Save keeps frozen versions when only another writer's content changed", async () => {
  await mount("sectioning")
  const first = await open()
  fireEvent.click(within(first).getByRole("checkbox"))
  state.save.mockImplementation(async () => { vi.mocked(api.getStepStatus).mockResolvedValue({ protectedWork: [record("sectioning", 9)] } as never) })
  await confirm()
  await waitFor(() => expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ replaceManual: true,
    protectedReplacements: [expect.objectContaining({ version: 7, sectioningInputSignature: "a".repeat(64) })] })))
  expect(screen.queryByText(/Settings were saved. Review replacement again/)).toBeNull()
})
