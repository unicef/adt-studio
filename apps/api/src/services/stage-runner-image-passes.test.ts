import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProgressEvent } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import type { Progress } from "@adt/pipeline"

const { extractPDFMock, extractMetadataMock, generateBookOutlineMock, generateObjectMock } = vi.hoisted(() => ({
  extractPDFMock: vi.fn(),
  extractMetadataMock: vi.fn(),
  generateBookOutlineMock: vi.fn(),
  generateObjectMock: vi.fn(),
}))

vi.mock("@adt/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@adt/pipeline")>("@adt/pipeline")
  return {
    ...actual,
    extractPDF: extractPDFMock,
    extractMetadata: extractMetadataMock,
    generateBookOutline: generateBookOutlineMock,
  }
})

vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>("@adt/llm")
  return {
    ...actual,
    createLLMModel: vi.fn(() => ({ generateObject: generateObjectMock })),
  }
})

import { createStageRunner } from "./stage-runner.js"

function pngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAAH0lEQVR4AV3BwREAMAiAMMr+O1ufHsmbxSEhISEh8QGPSwQIxMxWxQAAAABJRU5ErkJggg==",
    "base64",
  )
}

/** Stand in for the PDF step: `count` pages, each with one 300×300 image when `withImage` says so. */
function seedPages(count: number, withImage: (pageNumber: number) => boolean = () => true) {
  return async (_options: unknown, storage: Storage, progress: Progress) => {
    progress.emit({ type: "step-start", step: "extract" })
    for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
      const pageId = `pg${String(pageNumber).padStart(3, "0")}`
      storage.putExtractedPage({
        pageId,
        pageNumber,
        text: `Page ${pageNumber}`,
        pageImage: { imageId: `${pageId}_page`, buffer: pngBuffer(), format: "png", hash: `hash-${pageId}`, width: 4, height: 6 },
        images: withImage(pageNumber)
          ? [{ imageId: `${pageId}_im001`, pageId, buffer: pngBuffer(), format: "png", hash: `img-${pageId}`, width: 300, height: 300, renderMethod: "raster" }]
          : [],
      })
    }
    progress.emit({ type: "step-complete", step: "extract" })
  }
}

/** The model: segmentation fails for the listed pages and finds nothing to split elsewhere. */
function segmentationFailsFor(pageIds: string[]) {
  return async (options: { log?: { taskType?: string; pageId?: string }; context?: { images?: Array<{ image_id?: string; imageId?: string }> } }) => {
    const { taskType, pageId } = options.log ?? {}
    if (taskType !== "image-segmentation") return { object: { summary: "A book.", reasoning: "" }, usage: { inputTokens: 1, outputTokens: 1 } }
    if (pageId && pageIds.includes(pageId)) throw new Error(`HTTP 500: injected failure for ${pageId}`)
    const images = (options.context?.images ?? []).map((img) => ({ image_id: img.image_id ?? img.imageId, reasoning: "", needs_segmentation: false, segments: [] }))
    return { object: { images }, usage: { inputTokens: 1, outputTokens: 1 } }
  }
}

describe("createStageRunner image segmentation warnings", () => {
  let tmpDir = ""
  let booksDir = ""
  let promptsDir = ""
  let configPath = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-image-passes-"))
    booksDir = path.join(tmpDir, "books")
    promptsDir = path.join(tmpDir, "prompts")
    configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(configPath, "role_types:\n  section_text: Main body text\nstructure_types:\n  paragraph: Paragraph\nimage_filters:\n  meaningfulness: false\n  segmentation: true\n  cropping: false\n")
    for (const mock of [extractPDFMock, extractMetadataMock, generateBookOutlineMock, generateObjectMock]) mock.mockReset()
    extractMetadataMock.mockResolvedValue({ title: "Book", authors: [], publisher: null, language_code: "en", cover_page_number: null, reasoning: "" })
    generateBookOutlineMock.mockResolvedValue({ reasoning: "", entries: [], styleClusters: [] })
  })

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
  })

  async function runExtract(label: string): Promise<ProgressEvent[]> {
    // The runner only admits a book directory that holds its PDF; the PDF step itself is mocked.
    fs.mkdirSync(path.join(booksDir, label), { recursive: true })
    fs.writeFileSync(path.join(booksDir, label, `${label}.pdf`), "")
    const events: ProgressEvent[] = []
    await createStageRunner().run(
      label,
      { booksDir, credentials: { openai: { apiKey: "sk-test" } }, promptsDir, configPath, fromStage: "extract", toStage: "extract" },
      { emit: (event) => events.push(event) },
    ).catch(() => undefined)
    return events
  }

  const segmentationComplete = (events: ProgressEvent[]) =>
    events.find((event) => event.type === "step-complete" && event.step === "image-segmentation")

  it("AC-25: completes with a typed pages-unchanged warning, persisted with the step", async () => {
    extractPDFMock.mockImplementation(seedPages(4))
    generateObjectMock.mockImplementation(segmentationFailsFor(["pg002"]))

    const events = await runExtract("one-fails")

    expect(segmentationComplete(events)).toEqual({
      type: "step-complete",
      step: "image-segmentation",
      warnings: [{ kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500: injected failure for pg002" }] }],
      message: "Completed — 1 page(s) kept their extracted images unchanged after a failure: pg002 (HTTP 500: injected failure for pg002)",
    })
    expect(events).toContainEqual({ type: "stage-complete", stage: "extract" })
    const storage = createBookStorage("one-fails", booksDir)
    try {
      expect(storage.getStepRuns().find((row) => row.step === "image-segmentation")).toMatchObject({
        status: "done",
        warnings: [{ kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500: injected failure for pg002" }] }],
      })
    } finally {
      storage.close()
    }
  })

  it("completes a clean pass without warnings", async () => {
    extractPDFMock.mockImplementation(seedPages(3))
    generateObjectMock.mockImplementation(segmentationFailsFor([]))

    const events = await runExtract("clean")

    expect(segmentationComplete(events)).toEqual({ type: "step-complete", step: "image-segmentation" })
  })

  it("fails the step when every one of at least three attempted pages failed", async () => {
    extractPDFMock.mockImplementation(seedPages(3))
    generateObjectMock.mockImplementation(segmentationFailsFor(["pg001", "pg002", "pg003"]))

    const events = await runExtract("all-fail")

    expect(segmentationComplete(events)).toBeUndefined()
    expect(events).toContainEqual(expect.objectContaining({
      type: "step-error",
      step: "image-segmentation",
      error: expect.stringContaining("every page failed: HTTP 500: injected failure for pg00"),
    }))
  })

  it("keeps a warning, not a step failure, when only two pages were attempted and both failed", async () => {
    // Four pages, but only two hold an image the pass can send.
    extractPDFMock.mockImplementation(seedPages(4, (pageNumber) => pageNumber <= 2))
    generateObjectMock.mockImplementation(segmentationFailsFor(["pg001", "pg002"]))

    const events = await runExtract("two-fail")

    expect(segmentationComplete(events)).toMatchObject({
      warnings: [{ kind: "pages-unchanged", pages: [{ pageId: "pg001" }, { pageId: "pg002" }] }],
    })
    expect(events).toContainEqual({ type: "stage-complete", stage: "extract" })
  })
})
