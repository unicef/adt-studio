// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const useParamsMock = vi.fn(() => ({ label: "demo-book", step: "validation" }))
const useSearchMock = vi.fn(() => ({ tab: "general" }))

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

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useParams: () => useParamsMock(),
    useSearch: () => useSearchMock(),
  }),
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/pipeline/stage-config", async () => {
  const React = await import("react")
  return {
    STAGES: [
      {
        slug: "validation",
        label: "Validation",
        icon: () => React.createElement("svg", { "data-testid": "validation-icon" }),
        color: "bg-emerald-600",
      },
      {
        slug: "easy-read",
        label: "Easy Read",
        icon: () => React.createElement("svg", { "data-testid": "easy-read-icon" }),
        color: "bg-cyan-600",
      },
      {
        slug: "preview",
        label: "Preview",
        icon: () => React.createElement("svg", { "data-testid": "preview-icon" }),
        color: "bg-gray-600",
      },
    ],
    isStageSlug: (slug: string) => slug === "validation" || slug === "easy-read" || slug === "preview",
  }
})

vi.mock("@/components/pipeline/pipeline-i18n", () => ({
  getStageLabelI18n: (slug: string) => (slug === "validation" ? "Validation" : slug),
}))

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  isElectron: () => false,
}))

vi.mock("@/components/pipeline/stages/extract/ExtractSettings", () => ({ ExtractSettings: () => <div>extract-settings</div> }))
vi.mock("@/components/pipeline/stages/sectioning/SectioningSettings", () => ({ SectioningSettings: () => <div>sectioning-settings</div> }))
vi.mock("@/components/pipeline/stages/storyboard/StoryboardSettings", () => ({ StoryboardSettings: () => <div>storyboard-settings</div> }))
vi.mock("@/components/pipeline/stages/quizzes/QuizzesSettings", () => ({ QuizzesSettings: () => <div>quizzes-settings</div> }))
vi.mock("@/components/pipeline/stages/glossary/GlossarySettings", () => ({ GlossarySettings: () => <div>glossary-settings</div> }))
vi.mock("@/components/pipeline/stages/toc/TocSettings", () => ({ TocSettings: () => <div>toc-settings</div> }))
vi.mock("@/components/pipeline/stages/easy-read/EasyReadSettings", () => ({ EasyReadSettings: () => <div>easy-read-settings</div> }))
vi.mock("@/components/pipeline/stages/captions/CaptionsSettings", () => ({ CaptionsSettings: () => <div>captions-settings</div> }))
vi.mock("@/components/pipeline/stages/languages/LanguageSettings", () => ({ LanguageSettings: () => <div>language-settings</div> }))
vi.mock("@/components/pipeline/stages/speech/SpeechSettings", () => ({ SpeechSettings: () => <div>speech-settings</div> }))

const validationSettingsMock = vi.fn(({ bookLabel, tab }: { bookLabel: string; tab?: string }) => (
  <div data-testid="validation-settings">
    validation-settings:{bookLabel}:{tab ?? "general"}
  </div>
))

vi.mock("@/components/pipeline/stages/ValidationSettings", () => ({
  ValidationSettings: (props: { bookLabel: string; tab?: string }) => validationSettingsMock(props),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("books.$label.$step.settings route", () => {
  it("renders Validation settings for the general tab", async () => {
    useParamsMock.mockReturnValue({ label: "demo-book", step: "validation" })
    useSearchMock.mockReturnValue({ tab: "general" })

    const { StepSettingsPage } = await import("./books.$label.$step.settings")
    render(<StepSettingsPage />)

    expect(screen.getByText("Validation")).toBeTruthy()
    expect(screen.getByText("Settings")).toBeTruthy()
    expect(screen.getByTestId("validation-settings").textContent).toContain("validation-settings:demo-book:general")
  })

  it("routes reviewer-checklist tab into Validation settings", async () => {
    useParamsMock.mockReturnValue({ label: "demo-book", step: "validation" })
    useSearchMock.mockReturnValue({ tab: "reviewer-checklist" })

    const { StepSettingsPage } = await import("./books.$label.$step.settings")
    render(<StepSettingsPage />)

    expect(screen.getByTestId("validation-settings").textContent).toContain("validation-settings:demo-book:reviewer-checklist")
    expect(validationSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookLabel: "demo-book", tab: "reviewer-checklist" }),
    )
  })

  it("renders Easy Read settings", async () => {
    useParamsMock.mockReturnValue({ label: "demo-book", step: "easy-read" })
    useSearchMock.mockReturnValue({ tab: "general" })

    const { StepSettingsPage } = await import("./books.$label.$step.settings")
    render(<StepSettingsPage />)

    expect(screen.getByText("easy-read-settings")).toBeTruthy()
  })

  it("shows the unavailable message for non-settings stages", async () => {
    useParamsMock.mockReturnValue({ label: "demo-book", step: "preview" })
    useSearchMock.mockReturnValue({ tab: "general" })

    const { StepSettingsPage } = await import("./books.$label.$step.settings")
    render(<StepSettingsPage />)

    expect(screen.getByText("Settings for this step are not yet available.")).toBeTruthy()
  })
})
