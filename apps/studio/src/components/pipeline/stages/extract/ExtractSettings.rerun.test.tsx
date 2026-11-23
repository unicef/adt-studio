// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ExtractRerunDiscards, ExtractRerunStatus } from "@adt/types"

const state = vi.hoisted(() => ({
  config: { data: { config: {} } }, active: { data: { merged: {} } },
  save: vi.fn(), queue: vi.fn(), navigate: vi.fn(), proceed: vi.fn(), reset: vi.fn(), blocked: false, provider: true,
  pages: [] as Array<{ pageId: string }>, rerun: undefined as ExtractRerunStatus | undefined, discards: null as ExtractRerunDiscards | null,
}))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: interpolate, i18n: { _: (d: { id?: string }) => d.id ?? "" } }) }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ id: interpolate(strings, ...values) }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate, useBlocker: () => ({ status: state.blocked ? "blocked" : "idle", proceed: state.proceed, reset: state.reset }) }))
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("@/hooks/use-book-config", () => ({ useBookConfig: () => state.config, useUpdateBookConfig: () => ({ mutateAsync: state.save, isPending: false }) }))
vi.mock("@/hooks/use-debug", () => ({ useActiveConfig: () => state.active }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ queueRun: state.queue, isRunning: false, extractRerun: state.rerun, extractRerunDiscards: state.discards }) }))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "test-only" }), useBookStructuredTextAvailability: () => state.provider }))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: state.pages }) }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/components/pipeline/settings-tabs", () => ({ getSettingsTabLabel: (_stage: string, tab: string) => tab }))
vi.mock("@/components/pipeline/components/PromptViewer", () => ({ PromptViewer: () => null, savePromptDraft: vi.fn(), toPromptDraft: vi.fn() }))
vi.mock("@/components/LanguagePicker", () => ({ LanguagePicker: () => null }))
vi.mock("@/api/client", () => ({ api: { getStepStatus: vi.fn() } }))
const { i18n } = await import("@lingui/core")
i18n.load("en", {})
i18n.activate("en")
const { ExtractSettings } = await import("./ExtractSettings")
const { FloatingSaveProvider } = await import("@/components/pipeline/components/floating-save")
const { UnsavedChangesGuard } = await import("@/components/pipeline/components/UnsavedChangesGuard")
const { SettingsDirtyTabsProvider } = await import("@/hooks/use-settings-dirty-tabs")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const attemptId = "7b0e9d4c-52a1-4a43-9c0e-2f6f3f1f8a11"
const offers = (...actions: ExtractRerunStatus["actions"]): ExtractRerunStatus => ({ actions, attemptId, blockedReason: null })
const twoPages = [{ pageId: "pg001" }, { pageId: "pg002" }]
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, { blocked: false, provider: true, pages: twoPages, rerun: offers("replace"), discards: { pages: 2, extractedImages: 7, addedImages: 1 } })
  state.save.mockResolvedValue({})
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })

const tree = () => <QueryClientProvider client={client}><TooltipProvider><SettingsDirtyTabsProvider><FloatingSaveProvider>
  <ExtractSettings bookLabel="book" tab="general" />
  <UnsavedChangesGuard />
</FloatingSaveProvider></SettingsDirtyTabsProvider></TooltipProvider></QueryClientProvider>
/** Mount the General tab and change an image filter, which makes the bar appear. */
async function editGeneral() {
  const view = render(tree())
  fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "120" } })
  await screen.findByRole("button", { name: "Save & Re-run" })
  return view
}
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement
const click = async (name: string) => { await act(async () => { fireEvent.click(button(name)) }) }
const replaceDialog = () => screen.findByRole("dialog", { name: "Extract this book again?" })

it("RAC-24: the General tab saves without starting a run", async () => {
  await editGeneral()
  expect(button("Save").disabled).toBe(false)
  await click("Save")
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  expect(state.save.mock.calls[0][0]).toMatchObject({ label: "book", config: { image_filters: { min_side: 120 } } })
  expect(state.queue).not.toHaveBeenCalled()
  expect(state.navigate).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
  // Saved: nothing is pending any more.
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save & Re-run" })).toBeNull())
})

it("RAC-23: Save & Re-run saves, asks for confirmation, then sends the replace request", async () => {
  await editGeneral()
  await click("Save & Re-run")
  const dialog = await replaceDialog()
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.queue).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }))
  expect(within(dialog).getAllByRole("term")[0].nextElementSibling?.textContent).toBe("2")
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard and extract again" }))
  expect(state.queue).toHaveBeenCalledExactlyOnceWith({
    fromStage: "extract", toStage: "extract", apiKey: "test-only",
    extraction: { action: "replace", attemptId }, viewAfterStart: true,
  })
  // The view follows the run only once the server accepted it, which queueRun owns.
  expect(state.navigate).not.toHaveBeenCalled()
  expect(state.save).toHaveBeenCalledTimes(1)
})

it("RAC-23: cancelling the confirmation keeps the saved settings and sends nothing", async () => {
  await editGeneral()
  await click("Save & Re-run")
  fireEvent.click(within(await replaceDialog()).getByRole("button", { name: "Cancel" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.queue).not.toHaveBeenCalled()
  expect(state.navigate).not.toHaveBeenCalled()
})

it.each(["retry", "resume"] as const)("RAC-24: Save & Re-run sends %s directly when a replace is not offered", async action => {
  state.rerun = offers(action)
  state.discards = null
  await editGeneral()
  await click("Save & Re-run")
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
  expect(state.queue).toHaveBeenCalledWith({ fromStage: "extract", toStage: "extract", apiKey: "test-only", extraction: { action, attemptId }, viewAfterStart: true })
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("RAC-24: with nothing offered the re-run is disabled with the reason and Save still works", async () => {
  state.rerun = { actions: [], attemptId, blockedReason: "downstream-output" }
  state.discards = null
  await editGeneral()
  const rerun = button("Save & Re-run")
  expect(rerun.disabled).toBe(true)
  fireEvent.click(rerun)
  fireEvent.focus(rerun.parentElement!)
  expect((await screen.findAllByText(/already has work from Sectioning or later stages/)).length).toBeGreaterThan(0)
  expect(button("Save").disabled).toBe(false)
  await click("Save")
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  expect(state.queue).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
})

it.each([
  { name: "a replace needs its confirmation", rerun: offers("replace") },
  { name: "nothing is offered", rerun: { actions: [], attemptId, blockedReason: "part-book" } satisfies ExtractRerunStatus },
])("RAC-24: saving while leaving the page starts no run when $name", async ({ rerun }) => {
  state.rerun = rerun
  const view = await editGeneral()
  state.blocked = true
  view.rerender(tree())
  // Worded as a plain save: no re-run is promised.
  const leave = await screen.findByRole("button", { name: "Save & leave" })
  await act(async () => { fireEvent.click(leave) })
  await waitFor(() => expect(state.proceed).toHaveBeenCalledTimes(1))
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.queue).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog", { name: "Extract this book again?" })).toBeNull()
})

it("RAC-24: saving while leaving the page still retries an unfinished extraction, without following it", async () => {
  state.rerun = offers("retry")
  const view = await editGeneral()
  state.blocked = true
  view.rerender(tree())
  const leave = await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Save & Re-run" })
  await act(async () => { fireEvent.click(leave) })
  await waitFor(() => expect(state.proceed).toHaveBeenCalledTimes(1))
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.queue).toHaveBeenCalledExactlyOnceWith({ fromStage: "extract", toStage: "extract", apiKey: "test-only", extraction: { action: "retry", attemptId }, viewAfterStart: false })
})

it("a book that was never extracted keeps today's Save & Re-run", async () => {
  Object.assign(state, { pages: [], rerun: { actions: [], attemptId: null, blockedReason: null }, discards: null })
  await editGeneral()
  await click("Save & Re-run")
  await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
  expect(state.queue).toHaveBeenCalledWith({ fromStage: "extract", toStage: "extract", apiKey: "test-only" })
  expect(state.save).toHaveBeenCalledTimes(1)
  expect(state.navigate).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("a failed save starts no run and keeps the user on the page", async () => {
  state.rerun = offers("retry")
  state.save.mockRejectedValueOnce(new Error("Save failed"))
  const view = await editGeneral()
  state.blocked = true
  view.rerender(tree())
  const leave = await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Save & Re-run" })
  await act(async () => { fireEvent.click(leave) })
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
  await waitFor(() => expect((leave as HTMLButtonElement).disabled).toBe(false))
  expect(state.queue).not.toHaveBeenCalled()
  expect(state.proceed).not.toHaveBeenCalled()
})
