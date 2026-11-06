// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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
    ? {
        title: "Archive problem",
        hint: "Review the archive details and try again.",
        kind: error.includes("Internal server error")
          ? "server"
          : error.includes(".db")
            ? "not-recognized"
            : error.includes("Archive file") || error.includes("ADT bundle")
              ? "adt-unreadable"
              : "other",
      }
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
  unreadableAdtDetails: (error: unknown) => (error as { details?: unknown }).details ?? null,
}))

const { ImportProject } = await import("./ImportProject")

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
    expect(screen.getByText("This export has no fingerprints")).toBeTruthy()
    expect(screen.getByText(/can’t tell whether its pages changed/)).toBeTruthy()
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
    expect(screen.getByText(/separate from your other projects/)).toBeTruthy()
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
    expect(screen.getByText("index.html")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review activities" })).toBeTruthy()
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

    expect(await screen.findByText(/to fix before import/)).toBeTruthy()
    expect(screen.getByText("Needs repair")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    // The problems are listed inline instead of in a Validation details dialog.
    expect(screen.getByText("manifest.json")).toBeTruthy()
    expect(screen.getByText("missing-editing-contract")).toBeTruthy()
    expect(screen.getByText(/has no editing contract/)).toBeTruthy()
    // The guide opens beside the problems, rendered from the real guide text.
    fireEvent.click(screen.getByRole("button", { name: "AI repair guide" }))
    const guide = screen.getByRole("region", { name: "AI repair guide" })
    expect(guide.textContent).toContain("Editing Unsupported book")
    expect(screen.getByText(/to fix before import/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close the guide" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Copy repair request" })[0])
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
    expect(screen.getByText(/separate from your other projects/)).toBeTruthy()
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

    await waitFor(() => expect(screen.getByText("This project can’t be imported")).toBeTruthy())
    expect(screen.getByText("Can’t be imported")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show error details" }))
    expect(screen.getByText("Invalid project database")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
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

  it("shows what ADT Studio looked for when a ZIP isn't an importable archive", async () => {
    previewImport.mockRejectedValue(new Error("Invalid project archive: expected a .db and .pdf file at the root level"))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "random.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("ADT Studio can’t import this ZIP")).toBeTruthy()
    expect(screen.getByText(/random.zip doesn’t match any of the archive types/)).toBeTruthy()
    expect(screen.getByText("Not found: manifest.json from an ADT Web export")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose another ZIP" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show error details" }))
    expect(screen.getByText(/expected a .db and .pdf file/)).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Import" }).hasAttribute("disabled")).toBe(true)
  })

  it("offers a repair request when an ADT export can't be read", async () => {
    const message = "Archive file has an invalid shape: manifest.json at editingContract.nonActivities.0.sectionId: Section cannot be both an activity and a non-activity: pg012_sec002"
    previewImport.mockRejectedValue(new Error(message))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "repaired-adt.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("This ADT export can’t be read")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Copy repair request" }))
    await waitFor(() => expect(writeClipboard).toHaveBeenCalled())
    const prompt = writeClipboard.mock.calls.at(-1)![0] as string
    expect(prompt).toContain("repaired-adt.zip")
    expect(prompt).toContain(message)
    expect(prompt).toContain("AGENTS.md")
    expect(prompt).toContain("may appear in only one of the two lists")
    expect(screen.getByRole("button", { name: "Choose repaired ZIP" })).toBeTruthy()
  })

  it("shows the book it could still read beside the repair request", async () => {
    const message = "Archive file has an invalid shape: manifest.json at editingContract.nonActivities.0.sectionId: Section cannot be both an activity and a non-activity: pg012_sec002"
    previewImport.mockRejectedValue(Object.assign(new Error(message), {
      details: {
        title: "Volcanoes",
        coverBase64: null,
        pageCount: 25,
        imageCount: null,
        tocEntryCount: 10,
        sourceLanguage: "en",
        outputLanguages: [],
      },
    }))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "repaired-adt.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("Volcanoes")).toBeTruthy()
    expect(screen.getByText("This export can’t be read")).toBeTruthy()
    expect(screen.getByText("Needs repair")).toBeTruthy()
    expect(screen.getByText("manifest.json")).toBeTruthy()
    // The image count couldn't be read, so it is marked instead of shown as 0.
    expect(screen.getByText("Couldn’t be read")).toBeTruthy()
    expect(screen.getByText(/Details marked “—” couldn’t be read/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Copy repair request" }))
    await waitFor(() => expect(writeClipboard).toHaveBeenCalled())
    expect(writeClipboard.mock.calls.at(-1)![0]).toContain(message)
    const choose = screen.getByRole("button", { name: "Choose repaired ZIP" })
    expect(choose.hasAttribute("disabled")).toBe(false)
  })

  it("lists each problem in a broken file on its own", async () => {
    previewImport.mockRejectedValue(Object.assign(new Error([
      "Archive file has an invalid shape: manifest.json has 2 problems",
      "- manifest.json at book.title: Expected string, received number",
      "- manifest.json at editingContract.nonActivities.0.sectionId: Section cannot be both an activity and a non-activity: pg012_sec002",
    ].join("\n")), {
      details: {
        title: null, coverBase64: null, pageCount: 25, imageCount: 30,
        tocEntryCount: 10, sourceLanguage: "en", outputLanguages: [],
      },
    }))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "broken.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("Title couldn’t be read")).toBeTruthy()
    expect(screen.getAllByText("manifest.json")).toHaveLength(2)
    // One list item per problem (the request box quotes the whole error too).
    const items = screen.getAllByRole("listitem").map((item) => item.textContent ?? "")
    expect(items.some((text) => text.includes("at book.title: Expected string"))).toBe(true)
    expect(items.some((text) => text.includes("Section cannot be both an activity"))).toBe(true)
  })

  it("does not offer a repair request when editing files can't fix the archive", async () => {
    previewImport.mockRejectedValue(new Error("ADT bundle exceeds the compressed archive size limit"))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "huge.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("This ADT export can’t be read")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Copy repair request" })).toBeNull()
    expect(screen.getByRole("button", { name: "Choose repaired ZIP" })).toBeTruthy()
  })

  it("retries a server error with the same archive", async () => {
    previewImport.mockRejectedValue(new Error("Internal server error"))
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "book.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    await waitFor(() => expect(previewImport).toHaveBeenCalledTimes(2))
    expect(previewImport.mock.calls[1][0]).toBe(file)
  })

  it("shows an import failure inside the review instead of blaming the archive", async () => {
    adtImportError = new Error("Internal server error")
    previewImport.mockResolvedValue({
      isAdtBundle: true,
      legacyRecovery: false,
      label: "volcanoes",
      title: "Volcanoes",
      coverBase64: null,
      sourceLanguage: "en",
      outputLanguages: [],
      runtimeFeatures: {},
      pageCount: 25,
      imageCount: 52,
      glossaryEntryCount: 0,
      tocEntryCount: 10,
      translationLanguageCount: 0,
      contentChanged: false,
      exportComparisonStatus: "unchanged",
      compatibility: { supported: true, issues: [] },
    })
    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "volcanoes.zip", { type: "application/zip" })] } })

    expect(await screen.findByText("The import didn’t finish")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try import again" })).toBeTruthy()
    expect(screen.getByText("Volcanoes")).toBeTruthy()
  })
})
