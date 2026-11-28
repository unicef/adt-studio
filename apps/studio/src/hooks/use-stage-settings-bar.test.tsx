// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { StageName } from "@adt/types"

const state = vi.hoisted(() => ({
  save: vi.fn(),
  queue: vi.fn(),
  navigate: vi.fn(),
  proceed: vi.fn(),
  reset: vi.fn(),
  blocked: false,
  pages: [{ pageId: "pg001" }] as unknown[] | undefined,
  stages: {} as Record<string, string>,
}))
const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: interpolate, i18n: { _: (d: { id?: string }) => d.id ?? "" } }),
}))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings[0] }) }))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useBlocker: () => ({ status: state.blocked ? "blocked" : "idle", proceed: state.proceed, reset: state.reset }),
}))
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ queueRun: state.queue, isRunning: false, stageState: (stage: string) => state.stages[stage] ?? "idle" }),
}))
vi.mock("@/hooks/use-pages", () => ({ usePages: () => ({ data: state.pages }) }))
vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({ apiKey: "test-only" }),
  useBookStructuredTextAvailability: () => true,
}))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/components/pipeline/settings-tabs", () => ({ getSettingsTabLabel: (_stage: string, tab: string) => tab }))
// Only TOC and Sectioning confirm before running; their path has its own tests.
vi.mock("@/components/pipeline/components/use-stage-run-confirmation", () => ({
  useStageRunConfirmation: () => ({ requestRun: vi.fn(), disabledReason: undefined, notice: null, dialog: null, busy: false }),
}))

const { useStageSettingsBar } = await import("./use-stage-settings-bar")
const { FloatingSaveProvider } = await import("@/components/pipeline/components/floating-save")
const { UnsavedChangesGuard } = await import("@/components/pipeline/components/UnsavedChangesGuard")
const { SettingsDirtyTabsProvider } = await import("./use-settings-dirty-tabs")
const { TooltipProvider } = await import("@/components/ui/tooltip")

function Settings({ stage, showSaveOnly }: { stage: StageName; showSaveOnly: boolean }) {
  useStageSettingsBar({
    stage,
    bookLabel: "a",
    dirty: true,
    dirtyTabs: ["general"],
    saving: false,
    save: state.save,
    showSaveOnly,
  })
  return null
}

function mount(stage: StageName = "storyboard", showSaveOnly = false) {
  render(
    <TooltipProvider>
      <SettingsDirtyTabsProvider>
        <FloatingSaveProvider>
          <Settings stage={stage} showSaveOnly={showSaveOnly} />
          <UnsavedChangesGuard />
        </FloatingSaveProvider>
      </SettingsDirtyTabsProvider>
    </TooltipProvider>,
  )
}

const button = (name: string | RegExp, within_: HTMLElement = document.body) =>
  within(within_).getByRole("button", { name }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  state.save.mockResolvedValue(undefined)
  state.blocked = false
  state.pages = [{ pageId: "pg001" }]
  state.stages = {}
})
afterEach(cleanup)

describe("a rejected settings save (#1227)", () => {
  it("Save & Re-run shows why the save failed and does not start the run", async () => {
    mount()
    state.save.mockRejectedValueOnce(new Error("Simulated save failure"))
    fireEvent.click(await screen.findByRole("button", { name: "Save & Re-run" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Save failed: Simulated save failure")
    expect(state.queue).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()

    // The next attempt clears the message and runs once the save succeeds.
    fireEvent.click(button("Save & Re-run"))
    await waitFor(() => expect(state.queue).toHaveBeenCalledExactlyOnceWith({
      fromStage: "storyboard", toStage: "storyboard", apiKey: "test-only",
    }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(state.navigate).toHaveBeenCalledTimes(1)
  })

  it("plain Save shows why the save failed", async () => {
    mount("storyboard", true)
    state.save.mockRejectedValueOnce(new Error("Simulated save failure"))
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Save failed: Simulated save failure")
    expect(state.queue).not.toHaveBeenCalled()

    fireEvent.click(button("Discard"))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("the unsaved-changes dialog shows why the save failed and stays on the page", async () => {
    state.blocked = true
    mount()
    state.save.mockRejectedValueOnce(new Error("Simulated save failure"))
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(button("Save & Re-run", dialog))

    const alert = await within(dialog).findByRole("alert")
    expect(alert.textContent).toBe("Save failed: Simulated save failure")
    expect(state.proceed).not.toHaveBeenCalled()
    expect(state.queue).not.toHaveBeenCalled()

    fireEvent.click(button("Save & Re-run", dialog))
    await waitFor(() => expect(state.proceed).toHaveBeenCalledTimes(1))
    expect(within(dialog).queryByRole("alert")).toBeNull()
    expect(state.queue).toHaveBeenCalledTimes(1)
  })
})

describe("a book with no pages (#1231)", () => {
  beforeEach(() => { state.pages = [] })

  it("disables Save & Re-run and saves without starting a run", async () => {
    mount()
    const rerun = await screen.findByRole("button", { name: "Save & Re-run" }) as HTMLButtonElement
    expect(rerun.disabled).toBe(true)
    fireEvent.click(rerun)
    expect(state.save).not.toHaveBeenCalled()

    fireEvent.click(button("Save"))
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1))
    expect(state.queue).not.toHaveBeenCalled()
  })

  it("the unsaved-changes dialog offers a save without a re-run", async () => {
    state.blocked = true
    mount()
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).queryByRole("button", { name: "Save & Re-run" })).toBeNull()
    fireEvent.click(button("Save & leave", dialog))

    await waitFor(() => expect(state.proceed).toHaveBeenCalledTimes(1))
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.queue).not.toHaveBeenCalled()
  })

  it.each(["running", "queued", "done"])("keeps Save & Re-run when Extract is %s", async (extract) => {
    state.stages = { extract }
    mount()
    fireEvent.click(await screen.findByRole("button", { name: "Save & Re-run" }))
    await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1))
  })

  it("keeps Save & Re-run in the Extract settings", async () => {
    mount("extract")
    fireEvent.click(await screen.findByRole("button", { name: "Save & Re-run" }))
    await waitFor(() => expect(state.queue).toHaveBeenCalledExactlyOnceWith({
      fromStage: "extract", toStage: "extract", apiKey: "test-only",
    }))
  })

  it("keeps Save & Re-run while the page list has not loaded", async () => {
    state.pages = undefined
    mount()
    expect((await screen.findByRole("button", { name: "Save & Re-run" }) as HTMLButtonElement).disabled).toBe(false)
  })
})
