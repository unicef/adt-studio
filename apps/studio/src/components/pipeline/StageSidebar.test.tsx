// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const stageStateMock = vi.fn((slug: string) => {
  if (slug === "storyboard" || slug === "validation") return "done"
  return "idle"
})
const matchRouteMock = vi.fn(() => true)
const searchMock = { tab: "reviewer-checklist" }

vi.mock("@lingui/core", () => ({
  i18n: {
    _: (value: unknown) => {
      if (typeof value === "string") return value
      if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
        return value.id
      }
      return String(value ?? "")
    },
  },
}))

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

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: {
      _: (value: unknown) => {
        if (typeof value === "string") return value
        if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
          return value.id
        }
        return String(value ?? "")
      },
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, title, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a title={title} {...props}>{children}</a>
  ),
  useMatchRoute: () => matchRouteMock,
  useSearch: () => searchMock,
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
  }),
}))

vi.mock("./pipeline-i18n", () => {
  const stageLabels: Record<string, string> = {
    book: "Book",
    extract: "Extract",
    sectioning: "Sectioning",
    storyboard: "Storyboard",
    quizzes: "Quizzes",
    captions: "Image Captions",
    glossary: "Glossary",
    toc: "Table of Contents",
    "easy-read": "Easy Read",
    translate: "Language",
    speech: "Speech",
    "sign-language": "Sign Language",
    validation: "Validation",
    preview: "Preview",
    export: "Export",
  }
  return {
    getStageLabelI18n: (slug: string) => stageLabels[slug] ?? slug,
    getStepLabelI18n: (slug: string) => slug,
    getStageStatusLabelI18n: (status: string) => status,
  }
})

vi.mock("./settings-tabs", () => ({
  getSettingsTabs: (slug: string) => {
    if (slug !== "validation") return null
    return [
      { key: "accessibility", label: "Accessibility" },
      { key: "reviewer-checklist", label: "Reviewer Checklist" },
    ]
  },
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({
    stageState: stageStateMock,
    stepState: vi.fn(() => "idle"),
    stepProgress: vi.fn(() => null),
  }),
}))

vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({
    defaultModel: "anthropic:claude-sonnet-4-6",
    hasOpenAIKey: false,
    hasAnthropicKey: true,
    hasGoogleKey: false,
    hasCustomProvider: false,
    providerDefaultModels: {
      openai: "openai:gpt-5.4",
      anthropic: "anthropic:claude-sonnet-4-6",
      google: "google:gemini-2.5-pro",
      custom: "custom:your-model-name",
    },
  }),
}))

vi.mock("@/hooks/use-debug", () => ({
  useActiveConfig: () => ({ data: { merged: {} } }),
  useAccessibilityAssessment: () => ({
    data: {
      assessment: {
        generatedAt: "2026-03-16T10:00:00.000Z",
        tool: "axe-core",
        runOnlyTags: ["wcag2a"],
        disabledRules: [],
        summary: { pageCount: 1, pagesWithViolations: 1, pagesWithErrors: 0, violationCount: 1, incompleteCount: 0 },
        pages: [],
      },
    },
  }),
}))

vi.mock("@/hooks/use-book-tasks", () => ({
  useBookTasks: () => ({ runningTasks: [], runningCount: 0, tasks: [] }),
}))

vi.mock("@/hooks/use-books", () => ({
  usePackageAdtStatus: () => ({ data: { hasAdt: false } }),
}))

vi.mock("@/hooks/use-sign-language-videos", () => ({
  useSignLanguageVideos: () => ({ data: { videos: [] } }),
}))

vi.mock("@/hooks/use-stage-missing-counts", () => ({
  useStageMissingCounts: () => ({ translate: 0, speech: 0 }),
}))

vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({ data: [] }),
  usePageImage: () => ({ data: null }),
}))

vi.mock("@/hooks/use-quizzes", () => ({
  useQuizzes: () => ({ data: null }),
}))

vi.mock("@/routes/__root", () => ({
  useSettingsDialog: () => ({ openSettings: vi.fn() }),
}))

vi.mock("@/routes/books.$label", () => ({
  useSectionNav: () => ({ skipNextResetRef: { current: false } }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("StageSidebar", () => {
  it("shows the selected model below the file name and above the steps", async () => {
    const { StageSidebar } = await import("./components/StageSidebar")
    render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="extract"
      />,
    )

    const fileName = screen.getByText("DemoBook")
    const selectedModel = screen.getByTestId("selected-model-card")
    const extractStep = document.querySelector("[data-stage-slug='extract']")

    expect(extractStep).toBeTruthy()

    expect(fileName.compareDocumentPosition(selectedModel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(selectedModel.compareDocumentPosition(extractStep!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows Validation before Preview and exposes Validation settings tabs", async () => {
    const { StageSidebar } = await import("./components/StageSidebar")
    const { container } = render(
      <StageSidebar
        bookLabel="demo-book"
        activeStep="validation"
      />,
    )

    const validationLink = screen.getByTitle("Validation")
    const previewLink = screen.getByTitle("Preview")
    expect(validationLink.compareDocumentPosition(previewLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getAllByTitle(/^Validation/).some((element) => element.getAttribute("to") === "/books/$label/$step/settings")).toBe(true)
    expect(screen.getByText("Accessibility")).toBeTruthy()
    expect(screen.getByText("Reviewer Checklist")).toBeTruthy()
    expect(container.textContent).toContain("Validation")
    expect(container.textContent).toContain("Preview")
  })
})
