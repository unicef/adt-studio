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

/** Stand in for the PDF step: store `count` pages with the given text layer. */
function seedPages(count: number, text: (pageNumber: number) => string) {
  return async (_options: unknown, storage: Storage, progress: Progress) => {
    progress.emit({ type: "step-start", step: "extract" })
    for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
      const pageId = `pg${String(pageNumber).padStart(3, "0")}`
      storage.putExtractedPage({
        pageId,
        pageNumber,
        text: text(pageNumber),
        pageImage: { imageId: `${pageId}_page`, buffer: pngBuffer(), format: "png", hash: `hash-${pageId}`, width: 4, height: 6 },
        images: [],
      })
    }
    progress.emit({ type: "step-complete", step: "extract" })
  }
}

describe("createStageRunner book summary", () => {
  let tmpDir = ""
  let booksDir = ""
  let promptsDir = ""
  let configPath = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-book-summary-"))
    booksDir = path.join(tmpDir, "books")
    promptsDir = path.join(tmpDir, "prompts")
    configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(configPath, "role_types:\n  section_text: Main body text\nstructure_types:\n  paragraph: Paragraph\nimage_filters:\n  meaningfulness: false\n  segmentation: false\n  cropping: false\n")
    extractPDFMock.mockReset()
    extractMetadataMock.mockReset()
    generateBookOutlineMock.mockReset()
    generateObjectMock.mockReset()
    extractMetadataMock.mockResolvedValue({ title: "Libro", authors: [], publisher: null, language_code: "es", cover_page_number: null, reasoning: "" })
    generateBookOutlineMock.mockResolvedValue({ reasoning: "", entries: [], styleClusters: [] })
  })

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
  })

  async function runExtract(label: string, signal?: AbortSignal): Promise<ProgressEvent[]> {
    // The runner only admits a book directory that holds its PDF; the PDF step itself is mocked.
    fs.mkdirSync(path.join(booksDir, label), { recursive: true })
    fs.writeFileSync(path.join(booksDir, label, `${label}.pdf`), "")
    const events: ProgressEvent[] = []
    await createStageRunner().run(
      label,
      { booksDir, credentials: { openai: { apiKey: "sk-test" } }, promptsDir, configPath, fromStage: "extract", toStage: "extract", signal },
      { emit: (event) => events.push(event) },
    )
    return events
  }

  it("completes the step with a note and still builds the outline when the summary call fails", async () => {
    extractPDFMock.mockImplementation(seedPages(2, (n) => `Página ${n}`))
    generateObjectMock.mockRejectedValue(new Error("The model `gpt-nope` does not exist"))

    const events = await runExtract("summary-fails")

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "step-start", step: "book-summary" }),
      expect.objectContaining({
        type: "step-complete",
        step: "book-summary",
        message: "Completed — no book summary after a failure: The model `gpt-nope` does not exist",
      }),
      expect.objectContaining({ type: "step-complete", step: "book-outline" }),
      expect.objectContaining({ type: "stage-complete", stage: "extract" }),
    ]))
    expect(events.filter((event) => event.type === "step-error")).toEqual([])
    expect(generateBookOutlineMock).toHaveBeenCalledTimes(1)

    const storage = createBookStorage("summary-fails", booksDir)
    try {
      expect(storage.getLatestNodeData("book-summary", "book")).toBeNull()
      expect(storage.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          step: "book-summary",
          status: "done",
          message: "Completed — no book summary after a failure: The model `gpt-nope` does not exist",
        }),
        expect.objectContaining({ step: "book-outline", status: "done" }),
      ]))
    } finally {
      storage.close()
    }
  })

  it("lets a cancel during the summary call unwind the run without a note", async () => {
    extractPDFMock.mockImplementation(seedPages(1, () => "Texto"))
    const controller = new AbortController()
    generateObjectMock.mockImplementation(async () => {
      controller.abort()
      throw new Error("aborted")
    })

    const events: ProgressEvent[] = []
    const run = createStageRunner().run(
      "cancelled",
      { booksDir, credentials: { openai: { apiKey: "sk-test" } }, promptsDir, configPath, fromStage: "extract", toStage: "extract", signal: controller.signal },
      { emit: (event) => events.push(event) },
    )
    fs.mkdirSync(path.join(booksDir, "cancelled"), { recursive: true })
    fs.writeFileSync(path.join(booksDir, "cancelled", "cancelled.pdf"), "")
    await expect(run).rejects.toThrow()

    expect(events.find((event) => event.type === "step-complete" && event.step === "book-summary")).toBeUndefined()
    expect(events.find((event) => event.type === "stage-complete")).toBeUndefined()
    expect(generateBookOutlineMock).not.toHaveBeenCalled()
  })

  it("sends page renders instead of text for a book without a text layer", async () => {
    extractPDFMock.mockImplementation(seedPages(3, () => ""))
    generateObjectMock.mockResolvedValue({ object: { summary: "Un cuaderno de matemática." }, usage: { inputTokens: 1, outputTokens: 1 } })

    const events = await runExtract("image-only")

    const summaryCall = generateObjectMock.mock.calls
      .map((call) => call[0] as { log?: { taskType?: string }; context?: Record<string, unknown> })
      .find((options) => options.log?.taskType === "book-summary")
    expect(summaryCall?.context?.pages).toEqual([])
    expect(summaryCall?.context?.page_renders).toEqual([
      { pageNumber: 1, imageBase64: pngBuffer().toString("base64") },
      { pageNumber: 2, imageBase64: pngBuffer().toString("base64") },
      { pageNumber: 3, imageBase64: pngBuffer().toString("base64") },
    ])
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "step-complete", step: "book-summary" }),
    ]))
    const completion = events.find((event) => event.type === "step-complete" && event.step === "book-summary")
    expect(completion).not.toHaveProperty("message")

    const storage = createBookStorage("image-only", booksDir)
    try {
      expect(storage.getLatestNodeData("book-summary", "book")?.data).toEqual({ summary: "Un cuaderno de matemática." })
    } finally {
      storage.close()
    }
  })

  it("sends only the text layer, cut to the budget, when most pages have text", async () => {
    extractPDFMock.mockImplementation(seedPages(4, (n) => (n === 4 ? "" : `Página ${n} ` + "x".repeat(5_000))))
    generateObjectMock.mockResolvedValue({ object: { summary: "Resumen." }, usage: { inputTokens: 1, outputTokens: 1 } })

    await runExtract("text-rich")

    const summaryCall = generateObjectMock.mock.calls
      .map((call) => call[0] as { log?: { taskType?: string }; context?: { pages?: Array<{ pageNumber: number; text: string }>; page_renders?: unknown[] } })
      .find((options) => options.log?.taskType === "book-summary")
    expect(summaryCall?.context?.page_renders).toEqual([])
    expect(summaryCall?.context?.pages?.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    for (const page of summaryCall?.context?.pages ?? []) {
      expect(page.text.length).toBeLessThanOrEqual(2_000 + " […]".length)
      expect(page.text.endsWith(" […]")).toBe(true)
    }
  })
})
