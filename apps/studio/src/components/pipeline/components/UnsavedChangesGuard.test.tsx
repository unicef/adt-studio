// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let text = ""
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index]
    if (index < values.length) text += String(values[index])
  }
  return text
}

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: interpolate, i18n: { _: (d: { id?: string }) => d?.id ?? "" } }),
}))

// The guard is always mounted "blocked" here — the navigation machinery itself
// is not what these tests exercise.
const proceed = vi.fn()
const reset = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => ({ status: "blocked", proceed, reset }),
}))

// The floating bar renders the same pending label and Save buttons as the
// dialog; stub it out so assertions can only match the dialog.
vi.mock("./FloatingSaveBar", () => ({ FloatingSaveBar: () => null }))

vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("../settings-tabs", () => ({
  getSettingsTabLabel: (_stage: string, tabKey: string) => tabKey,
}))

const { FloatingSaveProvider, useFloatingSave } = await import("./floating-save")
const { SettingsDirtyTabsProvider } = await import("@/hooks/use-settings-dirty-tabs")
const { UnsavedChangesGuard } = await import("./UnsavedChangesGuard")

/** A sectioning-style editor entry whose dirty flag the test drives. */
function Editor({ dirty }: { dirty: boolean }) {
  useFloatingSave({
    id: "sectioning:pg002",
    stage: "sectioning",
    resetStages: ["storyboard", "quizzes"],
    dirty,
    saving: false,
    label: <span>1 section edited</span>,
    labelKey: "edited:1",
    onSave: () => {},
    onSaveStay: async () => {},
    onDiscard: () => {},
  })
  return null
}

function mount(dirty: boolean) {
  const view = render(
    <FloatingSaveProvider>
      <SettingsDirtyTabsProvider>
        <Editor dirty={dirty} />
        <UnsavedChangesGuard />
      </SettingsDirtyTabsProvider>
    </FloatingSaveProvider>,
  )
  return view
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("UnsavedChangesGuard", () => {
  it("attributes the dialog to the stage that has pending edits", () => {
    mount(true)

    expect(screen.getByText("sectioning")).toBeTruthy()
    expect(screen.getByText("1 section edited")).toBeTruthy()
    expect(screen.getByRole("button", { name: /save & leave/i })).toBeTruthy()
    expect(screen.queryByText("Heads up")).toBeNull()
    expect(screen.getByText(/completed stages below will be reset/i)).toBeTruthy()
    expect(screen.getByText("storyboard")).toBeTruthy()
    expect(screen.getByText("quizzes")).toBeTruthy()
  })

  it("keeps its content while a save clears the dirty entry mid-flight", async () => {
    // An editor persists, drops its dirty entry, and only then resolves — the
    // navigation resumes after that, so the dialog is briefly open with no
    // entries. It must not degrade into a generic, button-less "Heads up".
    const { rerender } = mount(true)

    await act(async () => {
      rerender(
        <FloatingSaveProvider>
          <SettingsDirtyTabsProvider>
            <Editor dirty={false} />
            <UnsavedChangesGuard />
          </SettingsDirtyTabsProvider>
        </FloatingSaveProvider>,
      )
    })

    expect(screen.queryByText("Heads up")).toBeNull()
    expect(screen.getByText("sectioning")).toBeTruthy()
    expect(screen.getByText("1 section edited")).toBeTruthy()
    expect(screen.getByRole("button", { name: /save & leave/i })).toBeTruthy()
  })

  it("freezes attribution and actions while a multi-entry save settles", async () => {
    function PendingEditor({
      id,
      stage,
      dirty,
      label,
      reruns,
    }: {
      id: string
      stage: "extract" | "sectioning"
      dirty: boolean
      label: string
      reruns?: boolean
    }) {
      useFloatingSave({
        id,
        stage,
        dirty,
        saving: false,
        label: <span>{label}</span>,
        labelKey: label,
        onSaveStay: async () => {},
        onSaveAndRerun: reruns ? () => {} : undefined,
      })
      return null
    }

    const content = (firstDirty: boolean) => (
      <FloatingSaveProvider>
        <SettingsDirtyTabsProvider>
          <PendingEditor
            id="extract-settings"
            stage="extract"
            dirty={firstDirty}
            label="Extract settings"
            reruns
          />
          <PendingEditor
            id="sectioning:pg002"
            stage="sectioning"
            dirty
            label="Sectioning edit"
          />
          <UnsavedChangesGuard />
        </SettingsDirtyTabsProvider>
      </FloatingSaveProvider>
    )

    const { rerender } = render(content(true))
    expect(screen.getByText("extract")).toBeTruthy()
    expect(screen.getByText("Extract settings")).toBeTruthy()
    expect(screen.getByText("Sectioning edit")).toBeTruthy()
    expect(screen.getByRole("button", { name: /save & re-run/i })).toBeTruthy()

    await act(async () => {
      rerender(content(false))
    })

    expect(screen.getByText("extract")).toBeTruthy()
    expect(screen.getByText("Extract settings")).toBeTruthy()
    expect(screen.getByText("Sectioning edit")).toBeTruthy()
    expect(screen.getByRole("button", { name: /save & re-run/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /save & leave/i })).toBeNull()
  })

  it("offers Save & Re-run only for surfaces that actually queue a re-run", () => {
    function RerunEditor() {
      useFloatingSave({
        id: "settings:extract",
        stage: "extract",
        dirty: true,
        saving: false,
        onSaveStay: async () => {},
        onSaveAndRerun: async () => {},
      })
      return null
    }
    render(
      <FloatingSaveProvider>
        <SettingsDirtyTabsProvider>
          <RerunEditor />
          <UnsavedChangesGuard />
        </SettingsDirtyTabsProvider>
      </FloatingSaveProvider>,
    )

    expect(screen.getByRole("button", { name: /save & re-run/i })).toBeTruthy()
  })
})
