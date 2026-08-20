// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

Element.prototype.scrollIntoView = vi.fn()
const writeClipboard = vi.fn()
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: writeClipboard },
})

const navigate = vi.fn()
const previewImport = vi.fn()
const importProject = vi.fn()
const importAdt = vi.fn()
const importReset = vi.fn()
const adtImportReset = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
let importPending = false
let adtImportPending = false
let importError: Error | null = null
let adtImportError: Error | null = null
let dropZoneEnabled = true

const interpolate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: interpolate, i18n: { _: (value: { message?: string }) => value.message ?? "" } }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    message: interpolate(strings, ...values),
  }),
}))

vi.mock("@/components/ui/file-drop-overlay", () => ({
  FileDropOverlay: () => null,
  useFileDropZone: (options: { enabled?: boolean }) => {
    dropZoneEnabled = options.enabled ?? true
    return { overlay: null }
  },
}))

vi.mock("@/hooks/use-books", () => ({
  useImportBook: () => ({
    mutate: importProject,
    reset: importReset,
    error: importError,
    isPending: importPending,
  }),
  useImportAdtProject: () => ({
    mutate: importAdt,
    reset: adtImportReset,
    error: adtImportError,
    isPending: adtImportPending,
  }),
}))

vi.mock("@/hooks/use-archive-error", () => ({
  useFriendlyArchiveError: (error: string | null) => error
    ? { title: "Archive problem", hint: "Review the archive details and try again." }
    : null,
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

vi.mock("@/api/client", () => ({
  api: { previewImport },
  isPartImportPreview: (preview: { isPart?: boolean }) => preview.isPart === true,
  isAdtBundleImportPreview: (preview: { isAdtBundle?: boolean }) => preview.isAdtBundle === true,
}))

const { ImportProject } = await import("./ImportProject")
const { IMPORT_REVIEW_STATES } = await import("./import-project-review-fixtures")

afterEach(() => {
  cleanup()
  navigate.mockReset()
  previewImport.mockReset()
  importProject.mockReset()
  importAdt.mockReset()
  importReset.mockReset()
  adtImportReset.mockReset()
  importPending = false
  adtImportPending = false
  importError = null
  adtImportError = null
  dropZoneEnabled = true
  writeClipboard.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  window.history.replaceState({}, "", "/")
})

describe("ImportProject", () => {
  it.each(IMPORT_REVIEW_STATES)("renders the %s UI review state", (state) => {
    window.history.replaceState({}, "", `/books/import?uiReview=${state}`)

    render(<ImportProject />)

    expect(state === "activities-modal"
      ? screen.getByRole("dialog", { name: "Review activity pages" })
      : screen.getByRole("heading", { name: "Import a book" })).toBeTruthy()
  })

  it("states the archive size limit before selection", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=empty")

    render(<ImportProject />)

    expect(screen.getByText("ZIP archive · Maximum 512 MiB")).toBeTruthy()
  })

  it("keeps the selected archive visible while reading and after a preview error", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=reading")
    render(<ImportProject />)
    expect(screen.getByText("english-std-3-pb--2023-main.zip")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Replace archive" })).toBeTruthy()

    cleanup()
    window.history.replaceState({}, "", "/books/import?uiReview=archive-error")
    render(<ImportProject />)
    expect(screen.getByText("damaged-export.zip")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Replace archive" })).toBeTruthy()
  })

  it("describes baseline differences without attributing who made them", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=adt-edited")

    render(<ImportProject />)

    expect(screen.getByText("Changes since export detected")).toBeTruthy()
    expect(screen.getByText(/differs from its ADT Studio export baseline/)).toBeTruthy()
  })

  it("does not report edits for a fresh export whose baseline matches", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=adt-current")

    render(<ImportProject />)

    expect(screen.getByText("Ready to become a new project")).toBeTruthy()
    expect(screen.queryByText("Changes since export detected")).toBeNull()
    expect(screen.queryByText("Export baseline unavailable")).toBeNull()
  })

  it("keeps import failures concise and offers an immediate retry", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=import-error")

    render(<ImportProject />)

    expect(screen.getByText("Archive problem")).toBeTruthy()
    expect(screen.getByText("Hyena and Raven-adt.zip")).toBeTruthy()
    expect(screen.getByText("Show error details")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try import again" })).toBeTruthy()
  })

  it("keeps the cover and repair workflow in the review shell", () => {
    window.history.replaceState({}, "", "/books/import?uiReview=unsupported-current-guide")

    render(<ImportProject />)

    expect(screen.getByRole("heading", { name: "Edited publication needing repair" })).toBeTruthy()
    expect(screen.getByText("Book cover")).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Review/ }).getAttribute("data-state")).toBe("active")
    expect(screen.getByText("This archive needs repair before import")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Validation details" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose repaired ZIP" })).toBeTruthy()
    expect(screen.queryByText("Changes since export detected")).toBeNull()
    expect(screen.getByText("No cover available")).toBeTruthy()
  })

  it("transitions tabs without rendering overlapping content", () => {
    vi.useFakeTimers()
    window.history.replaceState({}, "", "/books/import?uiReview=adt-current")

    try {
      render(<ImportProject />)
      expect(screen.getByRole("tabpanel").parentElement?.className).toContain("flex-1")
      expect(screen.getByRole("tabpanel").parentElement?.className).toContain("overflow-hidden")
      const featuresTab = screen.getByRole("tab", { name: "Features" })
      fireEvent.keyDown(featuresTab, { key: "Enter" })

      expect(featuresTab.getAttribute("data-state")).toBe("active")
      expect(screen.getByRole("tabpanel").className).toContain("motion-safe:animate-out")
      expect(screen.getByText("Pages")).toBeTruthy()
      expect(screen.queryByText(/Features found in the archive/)).toBeNull()

      act(() => vi.advanceTimersByTime(120))

      expect(screen.getByRole("tabpanel").className).toContain("motion-safe:animate-in")
      expect(screen.queryByText("Pages")).toBeNull()
      expect(screen.getByText(/Features found in the archive/)).toBeTruthy()
      expect(screen.getByText("Scroll to see all features")).toBeTruthy()
      const storyboard = screen.getByText("Storyboard")
      expect(storyboard.parentElement?.textContent).toContain("Included")
      expect(storyboard.parentElement?.className).toContain("flex-col")
      expect(storyboard.parentElement?.querySelector("span")?.className).toContain("max-w-full")
      expect(storyboard.parentElement?.querySelector("span")?.className).toContain("whitespace-normal")
      const captions = screen.getByText("Image Captions")
      expect(captions.parentElement?.textContent).toContain("Included")

      const featureRegion = screen.getByRole("region", { name: "Features" })
      Object.defineProperty(featureRegion, "scrollHeight", { configurable: true, value: 800 })
      Object.defineProperty(featureRegion, "clientHeight", { configurable: true, value: 360 })
      featureRegion.scrollTop = 440
      fireEvent.scroll(featureRegion)
      expect(screen.queryByText("Scroll to see all features")).toBeNull()

      act(() => vi.advanceTimersByTime(180))
      expect(screen.getByRole("tabpanel").className).not.toContain("motion-safe:animate-in")
    } finally {
      vi.useRealTimers()
    }
  })

  it("imports an exported ADT through the shared import screen", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: true,
      label: "hyena-and-raven",
      title: "Hyena and Raven",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: ["es"],
      runtimeFeatures: { readAloud: true },
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 1,
      translationLanguageCount: 1,
      contentChanged: true,
      exportComparisonStatus: "unavailable",
      compatibility: { supported: true, issues: [] },
      match: { confidence: "none", recommendedProjectLabel: null, candidates: [] },
    })
    importAdt.mockImplementation((_payload, options) => {
      options.onSuccess({ label: "hyena-and-raven" })
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "hyena.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import as new project" })).toBeTruthy()
    })
    expect(screen.getByText("Export baseline unavailable")).toBeTruthy()
    expect(screen.getByText(/does not include fingerprints/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Import as new project" }))

    expect(importProject).not.toHaveBeenCalled()
    expect(importAdt).toHaveBeenCalledWith(
      { zip: file, activityDecisions: [] },
      expect.any(Object),
    )
    expect(navigate).toHaveBeenCalledWith({
      to: "/books/$label/$step",
      params: { label: "hyena-and-raven", step: "book" },
    })
  })

  it("never pairs an older preview with a newly selected archive", async () => {
    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    previewImport
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    importAdt.mockImplementation((_payload, options) => {
      options.onSuccess({ label: "second" })
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const first = new File(["first"], "first.zip", { type: "application/zip" })
    const second = new File(["second"], "second.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [first] } })
    fireEvent.change(input, { target: { files: [second] } })

    resolveSecond({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "second",
      title: "Second",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: {},
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: false,
      exportComparisonStatus: "unchanged",
      compatibility: { supported: true, issues: [] },
      match: { confidence: "none", recommendedProjectLabel: null, candidates: [] },
    })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import as new project" })).toBeTruthy()
    })

    resolveFirst({
      label: "first",
      title: "First",
      authors: [],
      publisher: null,
      languageCode: "en",
      pageCount: 1,
      hasSourcePdf: true,
      imageCount: 0,
      videoCount: 0,
      coverBase64: null,
      stages: {},
      validationError: null,
    })
    await Promise.resolve()
    fireEvent.click(screen.getByRole("button", { name: "Import as new project" }))

    expect(importProject).not.toHaveBeenCalled()
    expect(importAdt).toHaveBeenCalledWith(
      { zip: second, activityDecisions: [] },
      expect.any(Object),
    )
  })

  it("always creates a new project even when preview metadata identifies an origin", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "hyena-and-raven",
      title: "Hyena and Raven",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: { activities: true },
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: false,
      exportComparisonStatus: "unchanged",
      activityReview: {
        inventoryVersion: 2,
        items: [{
          sectionId: "qz001",
          href: "qz001.html",
          declaredType: "activity_quiz",
          detectedType: "activity_quiz",
          suggestedType: "activity_quiz",
          kind: "quiz",
          status: "confirmed",
          supportsStudioEditing: true,
          reasons: [],
          signals: ["interactive-control"],
          validationErrors: [],
          textPreview: "Question",
        }],
        needsReviewCount: 0,
        quizCount: 1,
        activityCount: 0,
        typeOptions: ["activity_quiz"],
      },
      compatibility: { supported: true, issues: [] },
      match: {
        confidence: "verified",
        recommendedProjectLabel: "hyena-and-raven",
        candidates: [{
          label: "hyena-and-raven",
          title: "Hyena and Raven",
          projectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
          reasons: ["project-id"],
        }],
      },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "hyena.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import as new project" })).toBeTruthy()
    })
    expect(screen.queryByText("Import destination")).toBeNull()
    expect(screen.getByText(/Existing projects stay unchanged/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Import as new project" }))

    expect(importAdt).toHaveBeenCalledWith(
      { zip: file, activityDecisions: [] },
      expect.any(Object),
    )
  })

  it("requires an explicit classification for an ambiguous external activity", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "external-activity",
      title: "External activity",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: { activities: true },
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: true,
      exportComparisonStatus: "changed",
      activityReview: {
        inventoryVersion: 2,
        items: [{
          sectionId: "pg001_sec001",
          href: "index.html",
          declaredType: null,
          detectedType: null,
          suggestedType: "activity_custom_external",
          kind: "candidate",
          status: "needs-review",
          supportsStudioEditing: false,
          reasons: ["interactive-unmarked"],
          signals: ["interactive-control"],
          validationErrors: [],
          textPreview: "Drag each word into the matching group.",
          previewHtml: "<html><body><section><p>Drag each word into the matching group.</p></section></body></html>",
        }],
        needsReviewCount: 1,
        quizCount: 0,
        activityCount: 1,
        typeOptions: ["activity_matching", "activity_custom_external"],
      },
      compatibility: { supported: true, issues: [] },
      agentGuide: {
        status: "missing",
        currentVersion: 2,
        files: {
          agentsMd: { present: false, version: null, current: false },
          claudeMd: { present: false, version: null, current: false },
        },
        currentGuide: "<!-- adt-studio-agent-guide: 2 -->\n# Editing External activity",
        repairPrompt: "Repair this exported ADT.",
        activityPrompt: "Classify the ambiguous activity candidate.",
      },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "external.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    const review = await screen.findByRole("button", { name: "Review 1 activities" })
    expect(review).toHaveProperty("disabled", false)
    expect(screen.getByText("Review 1 activities before import")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Copy AI instructions" }))
    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledWith("Classify the ambiguous activity candidate.")
    })
    expect(toastSuccess).toHaveBeenCalledWith("Copied")
    fireEvent.click(review)
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByTitle("Preview of index.html").getAttribute("srcdoc"))
      .toContain("Drag each word")
    fireEvent.click(screen.getByLabelText("Classification for index.html"))
    fireEvent.click(await screen.findByRole("option", { name: "Custom activity: external" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }))
    const ready = screen.getByRole("button", { name: "Import as new project" })
    expect(ready).toHaveProperty("disabled", false)
    fireEvent.click(ready)

    expect(importAdt).toHaveBeenCalledWith(
      {
        zip: file,
        activityDecisions: [{
          sectionId: "pg001_sec001",
          type: "activity_custom_external",
        }],
      },
      expect.any(Object),
    )
  })

  it("explains and blocks an exported ADT outside the supported HTML contract", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "unsupported-book",
      title: "Unsupported book",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: {},
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: true,
      exportComparisonStatus: "changed",
      compatibility: {
        supported: false,
        issues: [{ code: "missing-editing-contract", pageHref: "manifest.json" }],
      },
      agentGuide: {
        status: "missing",
        currentVersion: 2,
        files: {
          agentsMd: { present: false, version: null, current: false },
          claudeMd: { present: false, version: null, current: false },
        },
        currentGuide: "<!-- adt-studio-agent-guide: 2 -->\n# Editing Unsupported book",
        repairPrompt: "Repair this exported ADT using the current guide.",
        activityPrompt: null,
      },
      match: { confidence: "none", recommendedProjectLabel: null, candidates: [] },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["zip"], "unsupported.zip", { type: "application/zip" })] },
    })

    expect(await screen.findByText("This archive needs repair before import")).toBeTruthy()
    expect(screen.getByRole("button", { name: "AI repair guide" })).toBeTruthy()
    expect(screen.queryByText("Unsupported ADT structure")).toBeNull()
    expect(screen.queryByText("Archive ready to review")).toBeNull()
    expect(screen.getByText("Review details").className).toContain("text-amber-800")
    fireEvent.click(screen.getByRole("button", { name: "Validation details" }))
    expect(screen.getByText("manifest.json")).toBeTruthy()
    expect(screen.getAllByText("missing-editing-contract")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy repair request" }))
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(
      "Repair this exported ADT using the current guide.",
    ))
    const correctedZipButton = screen.getByRole("button", { name: "Choose repaired ZIP" })
    expect(correctedZipButton.hasAttribute("disabled")).toBe(false)
    fireEvent.click(correctedZipButton)
    expect(importAdt).not.toHaveBeenCalled()
  })

  it("does not offer local projects as import destinations", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "hyena-and-raven",
      title: "Hyena and Raven",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: {},
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: true,
      exportComparisonStatus: "changed",
      compatibility: { supported: true, issues: [] },
      match: {
        confidence: "possible",
        recommendedProjectLabel: "raven",
        candidates: [{
          label: "raven",
          title: "Hyena and Raven",
          projectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
          reasons: ["text-structure", "title"],
        }],
      },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["zip"], "edited.zip", { type: "application/zip" })] },
    })

    await screen.findByRole("button", { name: "Import as new project" })
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.queryByText("Project: raven")).toBeNull()
    expect(screen.getByText(/Existing projects stay unchanged/)).toBeTruthy()
  })

  it("announces a corrupt project preview as an error instead of ready", async () => {
    previewImport.mockResolvedValue({
      label: "corrupt-project",
      title: "Corrupt project",
      authors: [],
      publisher: null,
      languageCode: "en",
      pageCount: 1,
      hasSourcePdf: true,
      imageCount: 0,
      videoCount: 0,
      coverBase64: null,
      stages: {},
      validationError: "Invalid project database",
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["zip"], "corrupt.zip", { type: "application/zip" })] },
    })

    await waitFor(() => expect(screen.getByText("This project cannot be imported yet")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Validation details" })).toBeTruthy()
    expect(screen.queryByText("Archive ready to review")).toBeNull()
    expect(screen.getByRole("button", { name: "Import as new project" }).hasAttribute("disabled")).toBe(true)
  })

  it("offers no destination controls and locks file changes while importing", async () => {
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "hyena-and-raven",
      title: "Hyena and Raven",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: {},
      pageCount: 1,
      glossaryEntryCount: 0,
      tocEntryCount: 0,
      translationLanguageCount: 0,
      contentChanged: false,
      exportComparisonStatus: "unchanged",
      compatibility: { supported: true, issues: [] },
      match: {
        confidence: "verified",
        recommendedProjectLabel: "hyena-and-raven",
        candidates: [{
          label: "hyena-and-raven",
          title: "Hyena and Raven",
          projectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
          reasons: ["project-id"],
        }],
      },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "hyena.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByRole("button", { name: "Import as new project" })
    expect(screen.queryByRole("radio")).toBeNull()

    adtImportPending = true
    view.rerender(<ImportProject />)

    expect(input.disabled).toBe(true)
    expect(dropZoneEnabled).toBe(false)
    fireEvent.change(input, {
      target: { files: [new File(["other"], "other.zip", { type: "application/zip" })] },
    })
    expect(previewImport).toHaveBeenCalledTimes(1)
  })
})
