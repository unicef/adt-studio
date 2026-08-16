// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StepSettingsScreen } from "./StepSettingsScreen"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) text += String(values[index])
    }
    return { id: text }
  },
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
    i18n: { _: (descriptor: { id: string }) => descriptor.id },
  }),
}))

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  isElectron: () => false,
}))

vi.mock("@/components/pipeline/components/floating-save", () => ({
  FloatingSaveProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/pipeline/components/UnsavedChangesGuard", () => ({
  UnsavedChangesGuard: () => null,
}))

vi.mock("@/components/pipeline/pipeline-i18n", () => ({
  getStageLabelI18n: (slug: string) => (slug === "extract" ? "Extraction" : slug),
}))

vi.mock("@/components/title-bar/title-bar-controls", () => ({
  TitleBarControls: () => null,
}))

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/redesign/screens/pipeline/plugins/PluginDockPills", () => ({
  PluginDockPills: ({
    activeSlug,
    onOpenPlugin,
  }: {
    activeSlug?: string | null
    onOpenPlugin: (slug: string) => void
  }) => (
    <button type="button" data-testid="dock" onClick={() => onOpenPlugin("quizzes")}>
      dock:{activeSlug}
    </button>
  ),
}))

vi.mock("@/hooks/use-settings-dirty-tabs", () => ({
  SettingsDirtyTabsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDirtyTabsForStage: () => new Set<string>(["metadata-prompt"]),
}))

vi.mock("@/components/pipeline/stages/extract/ExtractSettings", () => ({
  ExtractSettings: ({ bookLabel, tab }: { bookLabel: string; tab?: string }) => (
    <div data-testid="extract-settings">
      extract-settings:{bookLabel}:{tab ?? "general"}
    </div>
  ),
}))
vi.mock("@/components/pipeline/stages/sectioning/SectioningSettings", () => ({ SectioningSettings: () => <div>sectioning-settings</div> }))
vi.mock("@/components/pipeline/stages/storyboard/StoryboardSettings", () => ({ StoryboardSettings: () => <div>storyboard-settings</div> }))
vi.mock("@/components/pipeline/stages/quizzes/QuizzesSettings", () => ({ QuizzesSettings: () => <div>quizzes-settings</div> }))
vi.mock("@/components/pipeline/stages/glossary/GlossarySettings", () => ({ GlossarySettings: () => <div>glossary-settings</div> }))
vi.mock("@/components/pipeline/stages/toc/TocSettings", () => ({ TocSettings: () => <div>toc-settings</div> }))
vi.mock("@/components/pipeline/stages/easy-read/EasyReadSettings", () => ({ EasyReadSettings: () => <div>easy-read-settings</div> }))
vi.mock("@/components/pipeline/stages/captions/CaptionsSettings", () => ({ CaptionsSettings: () => <div>captions-settings</div> }))
vi.mock("@/components/pipeline/stages/languages/LanguageSettings", () => ({ LanguageSettings: () => <div>language-settings</div> }))
vi.mock("@/components/pipeline/stages/speech/SpeechSettings", () => ({ SpeechSettings: () => <div>speech-settings</div> }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderScreen(
  overrides: Partial<{
    tab: string
    onClose: () => void
    onSelectTab: (tab: string) => void
    onOpenPlugin: (slug: string) => void
  }> = {},
) {
  const props = {
    label: "demo-book",
    slug: "extract" as const,
    tab: "general",
    foundations: [],
    plugins: [],
    onClose: vi.fn(),
    onSelectTab: vi.fn(),
    onOpenPlugin: vi.fn(),
    ...overrides,
  }
  render(<StepSettingsScreen {...props} />)
  return props
}

describe("StepSettingsScreen", () => {
  it("renders the step's settings for the active tab", () => {
    renderScreen()

    expect(screen.getByText("Extraction")).toBeTruthy()
    expect(screen.getByTestId("extract-settings").textContent).toContain("extract-settings:demo-book:general")
  })

  it("lists every settings tab of the step in the rail", () => {
    renderScreen()

    expect(screen.getByRole("button", { name: "General" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Segmentation Prompt" })).toBeTruthy()
  })

  it("falls back to the first tab when the requested one does not belong to the step", () => {
    renderScreen({ tab: "voices" })

    expect(screen.getByTestId("extract-settings").textContent).toContain("extract-settings:demo-book:general")
  })

  it("reports unsaved tabs to screen readers", () => {
    renderScreen()

    expect(screen.getByRole("button", { name: "Metadata Prompt (unsaved changes)" })).toBeTruthy()
  })

  it("selects a tab from the rail", () => {
    const props = renderScreen()

    fireEvent.click(screen.getByRole("button", { name: "Cropping Prompt" }))

    expect(props.onSelectTab).toHaveBeenCalledWith("cropping-prompt")
  })

  it("keeps the plugin dock available and marks the step being configured", () => {
    const props = renderScreen()

    const dock = screen.getByTestId("dock")
    expect(dock.textContent).toContain("dock:extract")

    fireEvent.click(dock)

    expect(props.onOpenPlugin).toHaveBeenCalledWith("quizzes")
  })

  it("closes from both the back button and the close button", () => {
    const props = renderScreen()

    fireEvent.click(screen.getByRole("button", { name: "Extraction" }))
    fireEvent.click(screen.getByRole("button", { name: "Close Extraction settings" }))

    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
