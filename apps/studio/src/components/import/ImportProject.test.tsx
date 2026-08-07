// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const navigate = vi.fn()
const previewImport = vi.fn()
const importProject = vi.fn()
const importAdt = vi.fn()
const importReset = vi.fn()
const adtImportReset = vi.fn()
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

vi.mock("@/api/client", () => ({
  api: { previewImport },
  isPartImportPreview: (preview: { isPart?: boolean }) => preview.isPart === true,
  isAdtBundleImportPreview: (preview: { isAdtBundle?: boolean }) => preview.isAdtBundle === true,
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
    expect(screen.getByText("Legacy ADT export detected")).toBeTruthy()
    expect(screen.getByText(/original PDF and extraction history are not available/)).toBeTruthy()
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
    expect(screen.getByText("Quizzes").closest("span")?.className).toContain("text-orange-600")
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
        }],
        needsReviewCount: 1,
        quizCount: 0,
        activityCount: 1,
        typeOptions: ["activity_matching", "activity_custom_external"],
      },
      compatibility: { supported: true, issues: [] },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["zip"], "external.zip", { type: "application/zip" })
    fireEvent.change(input, { target: { files: [file] } })

    const blocked = await screen.findByRole("button", { name: "Review 1 activities" })
    expect(blocked).toHaveProperty("disabled", true)
    fireEvent.change(screen.getByLabelText("Classification for index.html"), {
      target: { value: "activity_custom_external" },
    })
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
      compatibility: {
        supported: false,
        issues: [{ code: "missing-editing-contract", pageHref: "manifest.json" }],
      },
      match: { confidence: "none", recommendedProjectLabel: null, candidates: [] },
    })

    const view = render(<ImportProject />)
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["zip"], "unsupported.zip", { type: "application/zip" })] },
    })

    expect(await screen.findAllByText("Unsupported ADT structure")).toHaveLength(2)
    expect(screen.getByText(/missing ADT Studio round-trip metadata/)).toBeTruthy()
    expect(screen.queryByText("Archive ready to review")).toBeNull()
    expect(screen.getByText("Review details").className).toContain("text-red-700")
    const importButton = screen.getByRole("button", { name: "Import as new project" })
    expect(importButton.hasAttribute("disabled")).toBe(true)
    fireEvent.click(importButton)
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

    await waitFor(() => expect(screen.getByText("Archive problem")).toBeTruthy())
    expect(screen.queryByText("Archive ready to review")).toBeNull()
    expect(screen.getByRole("button", { name: "Import" }).hasAttribute("disabled")).toBe(true)
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
