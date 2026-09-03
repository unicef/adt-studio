import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PIPELINE, type AppConfig, type ProgressEvent } from "@adt/types"
import { computeSpeechCacheKey, stripEmojis } from "@adt/pipeline"
import { createBookStorage, openBookDb } from "@adt/storage"
import {
  buildStageRunnerImageClassifyConfig,
  createStageRunner,
  processWithConcurrency,
  RunCancelledError,
} from "./stage-runner.js"

const {
  capturedCaptionInputs,
  captionPageImagesMock,
  generateSpeechFileMock,
  easyReadGenerateObjectMock,
  generateBookOutlineMock,
  renderPageMock,
  sectionPageMock,
  transcribeWithWhisperMock,
} = vi.hoisted(() => {
  const capturedCaptionInputs: unknown[] = []
  return {
    capturedCaptionInputs,
    captionPageImagesMock: vi.fn(async (input: unknown) => {
      capturedCaptionInputs.push(input)
      return { captions: [] }
    }),
    easyReadGenerateObjectMock: vi.fn(),
    generateBookOutlineMock: vi.fn(),
    generateSpeechFileMock: vi.fn(),
    renderPageMock: vi.fn(async () => ({ sections: [] })),
    sectionPageMock: vi.fn(async () => ({ reasoning: "", sections: [] })),
    transcribeWithWhisperMock: vi.fn(),
  }
})

vi.mock("@adt/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@adt/pipeline")>(
    "@adt/pipeline"
  )
  return {
    ...actual,
    captionPageImages: captionPageImagesMock,
    generateBookOutline: generateBookOutlineMock,
    generateSpeechFile: generateSpeechFileMock,
    renderPage: renderPageMock,
    sectionPage: sectionPageMock,
  }
})

vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>("@adt/llm")
  return {
    ...actual,
    createLLMModel: vi.fn(() => ({
      generateObject: easyReadGenerateObjectMock,
    })),
    transcribeWithWhisper: transcribeWithWhisperMock,
  }
})

beforeEach(() => {
  easyReadGenerateObjectMock.mockReset()
  generateBookOutlineMock.mockReset()
  easyReadGenerateObjectMock.mockImplementation(async (options: {
    context?: { texts?: Array<{ text: string }> }
    validate?: (raw: unknown, context: unknown) => { valid: boolean; errors: string[] }
  }) => {
    const texts = options.context?.texts ?? []
    const object = { texts: texts.map((text) => `Easy: ${text.text}`) }
    const validation = options.validate?.(object, options.context)
    if (validation && !validation.valid) {
      throw new Error(validation.errors.join("\n"))
    }
    return { object, usage: { inputTokens: 1, outputTokens: 1 } }
  })
})

function pngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAAH0lEQVR4AV3BwREAMAiAMMr+O1ufHsmbxSEhISEh8QGPSwQIxMxWxQAAAABJRU5ErkJggg==",
    "base64",
  )
}

function writeBaseConfig(configPath: string): void {
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
`
  )
}

function writeSecondarySpeechConfig(
  configPath: string,
  options: {
    provider: "openai" | "azure" | "gemini" | "elevenlabs"
    voice: string
    model?: string
    label?: string
  },
): void {
  const secondaryLines = [
    `      provider: ${options.provider}`,
    ...(options.model ? [`      model: ${options.model}`] : []),
    `      voice: ${options.voice}`,
    ...(options.label ? [`      label: ${options.label}`] : []),
  ].join("\n")
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
 secondary_voices:
   en:
${secondaryLines}
`,
 )
}

function seedCaptionBook(
  booksDir: string,
  label: string,
  bookSummary?: string
): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [
        {
          imageId: "pg001_im001",
          buffer: Buffer.from("fake-image"),
          format: "png",
          hash: "hash-image",
          width: 400,
          height: 300,
        },
      ],
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<section><img data-id="pg001_im001" src="x" /></section>',
        },
      ],
    })

    if (bookSummary) {
      storage.putNodeData("book-summary", "book", { summary: bookSummary })
    }
  } finally {
    storage.close()
  }
}

function seedStoryboardBook(booksDir: string, label: string): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [
        {
          imageId: "pg001_im001",
          buffer: Buffer.from("fake-image"),
          format: "png",
          hash: "hash-image",
          width: 400,
          height: 300,
        },
      ],
    })

    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "existing sectioning",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "content",
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
          nodes: [
            {
              nodeId: "pg001_n001",
              isPruned: false,
              role: "text",
              text: "Hello",
            },
          ],
        },
      ],
    })
  } finally {
    storage.close()
  }
}

function seedEasyReadBook(booksDir: string, label: string): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Original text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })

    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "text_only",
          backgroundColor: "#fff",
          textColor: "#000",
          pageNumber: 1,
          isPruned: false,
          nodes: [],
        },
      ],
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "text_only",
          reasoning: "",
          html: '<section><p data-id="pg001_tx001">Original text</p></section>',
        },
      ],
    })

  } finally {
    storage.close()
  }
}

function readyCoreTtsEntry(id: string, text: string) {
  return {
    id,
    displayText: text,
    speechText: text,
    changed: false,
    transformations: [],
    status: "ready",
    generation: {
      mode: "unchanged",
      generatedAt: "2026-01-01T00:00:00.000Z",
      enabledTransformations: [],
      sourceTextHash: "source",
      contextHash: "context",
    },
  }
}

function seedTextAndSpeechBook(booksDir: string, label: string): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<p data-id="pg001_t001">Hello world</p>',
        },
      ],
    })

    storage.putNodeData("text-catalog", "book", {
      entries: [{ id: "pg001_t001", text: "Hello world" }],
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
    storage.putNodeData("core-tts-catalog", "en", {
      language: "en",
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [readyCoreTtsEntry("pg001_t001", "Hello world")],
    })
  } finally {
    storage.close()
  }
}

describe("buildStageRunnerImageClassifyConfig", () => {
  it("injects getImageBytes so min_stddev filtering can decode image bytes", () => {
    const config: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_filters: {
        min_side: 100,
        min_stddev: 2,
        meaningfulness: true,
      },
    }
    const expectedBytes = Buffer.from("fake-image-bytes")
    const storage = {
      getImageBase64: (_imageId: string) => expectedBytes.toString("base64"),
    }

    const imageConfig = buildStageRunnerImageClassifyConfig(config, storage)

    expect(imageConfig.filters).toEqual({
      min_side: 100,
      min_stddev: 2,
      meaningfulness: true,
    })
    expect(imageConfig.getImageBytes).toBeTypeOf("function")
    expect(imageConfig.getImageBytes?.("pg001_im001")).toEqual(expectedBytes)
  })
})

describe("createStageRunner assembled-book hierarchy rebuild", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
  })

  it("rebuilds a stale outline from stored pages before page sectioning", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-outline-rebuild-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
section_types:
  content: Content
`,
    )

    const storage = createBookStorage("assembled", booksDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Chapter One",
        pageImage: {
          imageId: "pg001_page",
          buffer: pngBuffer(),
          format: "png",
          hash: "page-hash",
          width: 4,
          height: 6,
        },
        images: [],
      })
      storage.putNodeData("book-outline", "book", {
        reasoning: "Stale part-local outline.",
        entries: [],
        styleClusters: [],
      })
      for (const step of PIPELINE.find((stage) => stage.name === "extract")!.steps) {
        if (step.name !== "book-outline") storage.markStepCompleted(step.name)
      }
      // Deliberately no completed book-outline step: merge invalidation uses
      // the step lifecycle, even when an older version remains inspectable.
    } finally {
      storage.close()
    }

    const rebuilt = {
      reasoning: "Authoritative assembled-book outline.",
      styleClusters: [
        { styleClusterId: "chapter-style", description: "Chapter", level: 1 },
      ],
      entries: [
        {
          outlineId: "outline-001",
          title: "Chapter One",
          level: 1,
          kind: "chapter",
          pageId: "pg001",
          pageNumber: 1,
          sourceCandidateIds: ["pg001_hc001"],
          parentId: null,
          styleClusterId: "chapter-style",
          confidence: 0.95,
        },
      ],
    }
    generateBookOutlineMock.mockResolvedValue(rebuilt)
    sectionPageMock.mockClear()

    const events: ProgressEvent[] = []
    await createStageRunner().run(
      "assembled",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "sectioning",
        toStage: "sectioning",
      },
      { emit: (event) => events.push(event) },
    )

    expect(generateBookOutlineMock).toHaveBeenCalledTimes(1)
    expect(sectionPageMock).toHaveBeenCalledTimes(1)
    expect(sectionPageMock.mock.calls[0][0]).toMatchObject({
      outline: {
        entries: rebuilt.entries,
        styleClusters: rebuilt.styleClusters,
      },
    })
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "step-start", step: "book-outline" }),
      expect.objectContaining({ type: "step-complete", step: "book-outline" }),
      expect.objectContaining({ type: "step-complete", step: "page-sectioning" }),
    ]))

    const verified = createBookStorage("assembled", booksDir)
    try {
      expect(verified.getLatestNodeData("book-outline", "book")).toMatchObject({
        version: 2,
        data: rebuilt,
      })
      expect(verified.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "book-outline", status: "done" }),
        expect.objectContaining({ step: "page-sectioning", status: "done" }),
      ]))
    } finally {
      verified.close()
    }
  })

  it("does not let a partially extracted normal book bypass Extract prerequisites", async () => {
    sectionPageMock.mockClear()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-outline-prereqs-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
section_types:
  content: Content
`,
    )
    const storage = createBookStorage("partial", booksDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Partial extraction",
        pageImage: {
          imageId: "pg001_page",
          buffer: pngBuffer(),
          format: "png",
          hash: "page-hash",
          width: 4,
          height: 6,
        },
        images: [],
      })
      storage.markStepCompleted("extract")
    } finally {
      storage.close()
    }

    await expect(createStageRunner().run(
      "partial",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "sectioning",
        toStage: "sectioning",
      },
      { emit: () => {} },
    )).rejects.toThrow("Extract prerequisites complete")
    expect(generateBookOutlineMock).not.toHaveBeenCalled()
    expect(sectionPageMock).not.toHaveBeenCalled()
  })
})

describe("createStageRunner captions step", () => {
  let tmpDir = ""

  beforeEach(() => {
    capturedCaptionInputs.length = 0
    captionPageImagesMock.mockClear()
    generateSpeechFileMock.mockReset()
    generateSpeechFileMock.mockResolvedValue(undefined)
    transcribeWithWhisperMock.mockReset()
    transcribeWithWhisperMock.mockResolvedValue({
      text: "Hello world",
      duration: 1,
      words: [
        { word: "Hello", start: 0, end: 0.45 },
        { word: "world", start: 0.45, end: 0.9 },
      ],
    })
    renderPageMock.mockClear()
    sectionPageMock.mockClear()
  })

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("passes book summary to captionPageImages when summary exists", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(
      booksDir,
      "with-summary",
      "A grade 3 science textbook about the water cycle."
    )

    const runner = createStageRunner()
    await runner.run(
      "with-summary",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "captions",
        toStage: "captions",
      },
      { emit: () => {} }
    )

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBe(
      "A grade 3 science textbook about the water cycle."
    )
  })

  it("omits book summary when summary node is missing", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(booksDir, "without-summary")

    const runner = createStageRunner()
    await runner.run(
      "without-summary",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "captions",
        toStage: "captions",
      },
      { emit: () => {} }
    )

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBeUndefined()
  })

  it("preserves a manual caption wholesale when captioning is re-run", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(booksDir, "rerun-manual")

    // The user manually edited this caption.
    {
      const storage = createBookStorage("rerun-manual", booksDir)
      try {
        storage.putNodeData("image-captioning", "pg001", {
          captions: [
            { imageId: "pg001_im001", reasoning: "edited", caption: "A cat on a mat", source: "manual" },
          ],
        })
      } finally {
        storage.close()
      }
    }

    // Re-run: the model returns a different caption (and would even flag it decorative).
    captionPageImagesMock.mockImplementationOnce(async (input: unknown) => {
      capturedCaptionInputs.push(input)
      return {
        captions: [
          { imageId: "pg001_im001", reasoning: "looks decorative", caption: "", decorative: true },
        ],
      }
    })

    const runner = createStageRunner()
    await runner.run(
      "rerun-manual",
      { booksDir, credentials: { openai: { apiKey: "sk-test" } }, promptsDir, configPath, fromStage: "captions", toStage: "captions" },
      { emit: () => {} }
    )

    const storage = createBookStorage("rerun-manual", booksDir)
    try {
      const stored = storage.getLatestNodeData("image-captioning", "pg001")?.data as {
        captions: Array<{ imageId: string; caption: string; decorative?: boolean; source?: string }>
      }
      const cap = stored.captions.find((x) => x.imageId === "pg001_im001")
      // Manual entry is preserved wholesale — text, no decorative, still manual.
      expect(cap?.caption).toBe("A cat on a mat")
      expect(cap?.decorative).toBeUndefined()
      expect(cap?.source).toBe("manual")
    } finally {
      storage.close()
    }
  })

  it("regenerates an AI-sourced caption on re-run", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(booksDir, "rerun-ai")

    // A prior AI-generated caption (no manual edit).
    {
      const storage = createBookStorage("rerun-ai", booksDir)
      try {
        storage.putNodeData("image-captioning", "pg001", {
          captions: [
            { imageId: "pg001_im001", reasoning: "old", caption: "Old caption", source: "ai" },
          ],
        })
      } finally {
        storage.close()
      }
    }

    captionPageImagesMock.mockImplementationOnce(async (input: unknown) => {
      capturedCaptionInputs.push(input)
      return {
        captions: [{ imageId: "pg001_im001", reasoning: "fresh", caption: "New caption" }],
      }
    })

    const runner = createStageRunner()
    await runner.run(
      "rerun-ai",
      { booksDir, credentials: { openai: { apiKey: "sk-test" } }, promptsDir, configPath, fromStage: "captions", toStage: "captions" },
      { emit: () => {} }
    )

    const storage = createBookStorage("rerun-ai", booksDir)
    try {
      const stored = storage.getLatestNodeData("image-captioning", "pg001")?.data as {
        captions: Array<{ imageId: string; caption: string; source?: string }>
      }
      const cap = stored.captions.find((x) => x.imageId === "pg001_im001")
      // AI entry is regenerated with the fresh caption, stamped source:"ai".
      expect(cap?.caption).toBe("New caption")
      expect(cap?.source).toBe("ai")
    } finally {
      storage.close()
    }
  })
})

describe("createStageRunner storyboard render-only", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("skips page sectioning and re-renders from existing section data", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-storyboard-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedStoryboardBook(booksDir, "render-only")

    const events: ProgressEvent[] = []
    const controller = new AbortController()
    const runner = createStageRunner()
    await runner.run(
      "render-only",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "storyboard",
        toStage: "storyboard",
        renderOnly: true,
        signal: controller.signal,
      },
      { emit: (event) => events.push(event) }
    )

    expect(sectionPageMock).not.toHaveBeenCalled()
    expect(renderPageMock).toHaveBeenCalledTimes(1)
    expect(renderPageMock.mock.calls[0]?.[5]).toEqual({
      signal: controller.signal,
    })
    // The step must be marked running before any page work, otherwise the UI
    // shows "Starting…" until the first page completes its full render loop.
    const renderStartIndex = events.findIndex(
      (event) => event.type === "step-start" && event.step === "web-rendering"
    )
    const renderCompleteIndex = events.findIndex(
      (event) => event.type === "step-complete" && event.step === "web-rendering"
    )
    expect(renderStartIndex).toBeGreaterThanOrEqual(0)
    expect(renderCompleteIndex).toBeGreaterThan(renderStartIndex)
    // page-sectioning is not part of the storyboard stage (it lives in the
    // sectioning stage), so running storyboard in render-only mode should
    // neither complete nor emit any events for page-sectioning.
    expect(
      events.some(
        (event) =>
          event.type === "step-complete" && event.step === "page-sectioning"
      )
    ).toBe(false)
  })
})

describe("createStageRunner easy read step", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("generates for a single Easy Read stage run even when disabled by default", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-easy-read-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedEasyReadBook(booksDir, "explicit-easy-read")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "explicit-easy-read",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "easy-read",
        toStage: "easy-read",
      },
      { emit: (event) => events.push(event) }
    )

    expect(easyReadGenerateObjectMock).toHaveBeenCalledTimes(1)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "easy-read"
      )
    ).toBe(true)

    const storage = createBookStorage("explicit-easy-read", booksDir)
    try {
      const row = storage.getLatestNodeData("easy-read", "book")
      expect(row?.data).toMatchObject({
        blocks: [
          {
            entries: [
              {
                sourceId: "pg001_tx001",
                easyReadId: "pg001_tx001_easy_read",
                originalText: "Original text",
                text: "Easy: Original text",
              },
            ],
          },
        ],
      })
      const easyReadStep = storage.getStepRuns().find((step) => step.step === "easy-read")
      expect(easyReadStep?.status).toBe("done")
    } finally {
      storage.close()
    }
  })
})

describe("createStageRunner translate without a prebuilt text-catalog", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  // The text-catalog is normally built by the easy-read stage. A standalone
  // translate run (or one after a caption/page edit cleared the catalog) must
  // rebuild it rather than silently skipping translation.
  it("rebuilds the missing text-catalog instead of skipping translation", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-translate-nocatalog-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
output_languages:
  - fr
`
    )

    // Seed a book with rendered text but NO text-catalog node.
    const seed = createBookStorage("translate-no-catalog", booksDir)
    try {
      seed.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Page text",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("fake-page-image"),
          format: "png",
          hash: "hash-page",
          width: 800,
          height: 600,
        },
        images: [],
      })
      seed.putNodeData("web-rendering", "pg001", {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "",
            html: '<p data-id="pg001_t001">Hello world</p>',
          },
        ],
      })
      expect(seed.getLatestNodeData("text-catalog", "book")).toBeFalsy()
    } finally {
      seed.close()
    }

    easyReadGenerateObjectMock.mockImplementation(async (options: {
      context?: { texts?: Array<{ text: string }> }
      validate?: (raw: unknown, context: unknown) => { valid: boolean; errors: string[] }
    }) => {
      const texts = options.context?.texts ?? []
      const object = { translations: texts.map((t) => `FR: ${t.text}`) }
      const validation = options.validate?.(object, options.context)
      if (validation && !validation.valid) {
        throw new Error(validation.errors.join("\n"))
      }
      return { object, usage: { inputTokens: 1, outputTokens: 1 } }
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "translate-no-catalog",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "translate",
      },
      { emit: (event) => events.push(event) }
    )

    // Translation must run, not skip.
    expect(
      events.some(
        (event) => event.type === "step-start" && event.step === "catalog-translation"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) => event.type === "step-skip" && event.step === "catalog-translation"
      )
    ).toBe(false)

    const verify = createBookStorage("translate-no-catalog", booksDir)
    try {
      const catalog = verify.getLatestNodeData("text-catalog", "book")?.data as
        | { entries?: unknown[] }
        | undefined
      expect(catalog?.entries?.length).toBeGreaterThan(0)

      const frTranslation = verify.getLatestNodeData("text-catalog-translation", "fr")
        ?.data as { entries?: unknown[] } | undefined
      expect(frTranslation?.entries?.length).toBeGreaterThan(0)
    } finally {
      verify.close()
    }
  })

  // Regression: a present-but-empty text-catalog node (e.g. persisted by
  // GET /text-catalog when the book was opened before Storyboard rendered)
  // previously stuck — Translate only rebuilt when the node was absent, so the
  // empty catalog silently skipped all translation. Translate must rebuild it.
  it("rebuilds a stale empty text-catalog instead of skipping translation", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-translate-emptycatalog-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
output_languages:
  - fr
`
    )

    // Seed a book with rendered text AND a stale, empty text-catalog node.
    const seed = createBookStorage("translate-empty-catalog", booksDir)
    try {
      seed.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Page text",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("fake-page-image"),
          format: "png",
          hash: "hash-page",
          width: 800,
          height: 600,
        },
        images: [],
      })
      seed.putNodeData("web-rendering", "pg001", {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "",
            html: '<p data-id="pg001_t001">Hello world</p>',
          },
        ],
      })
      // The poison: a persisted catalog with zero entries.
      seed.putNodeData("text-catalog", "book", {
        entries: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      const seeded = seed.getLatestNodeData("text-catalog", "book")?.data as
        | { entries?: unknown[] }
        | undefined
      expect(seeded?.entries?.length).toBe(0)
    } finally {
      seed.close()
    }

    easyReadGenerateObjectMock.mockImplementation(async (options: {
      context?: { texts?: Array<{ text: string }> }
      validate?: (raw: unknown, context: unknown) => { valid: boolean; errors: string[] }
    }) => {
      const texts = options.context?.texts ?? []
      const object = { translations: texts.map((t) => `FR: ${t.text}`) }
      const validation = options.validate?.(object, options.context)
      if (validation && !validation.valid) {
        throw new Error(validation.errors.join("\n"))
      }
      return { object, usage: { inputTokens: 1, outputTokens: 1 } }
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "translate-empty-catalog",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "translate",
      },
      { emit: (event) => events.push(event) }
    )

    // Translation must run, not skip on the stale empty catalog.
    expect(
      events.some(
        (event) => event.type === "step-skip" && event.step === "catalog-translation"
      )
    ).toBe(false)
    expect(
      events.some(
        (event) => event.type === "step-start" && event.step === "catalog-translation"
      )
    ).toBe(true)

    const verify = createBookStorage("translate-empty-catalog", booksDir)
    try {
      const catalog = verify.getLatestNodeData("text-catalog", "book")?.data as
        | { entries?: unknown[] }
        | undefined
      expect(catalog?.entries?.length).toBeGreaterThan(0)

      const frTranslation = verify.getLatestNodeData("text-catalog-translation", "fr")
        ?.data as { entries?: unknown[] } | undefined
      expect(frTranslation?.entries?.length).toBeGreaterThan(0)
    } finally {
      verify.close()
    }
  })

  it("prepares a separate Core TTS catalog for a same-base regional output", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-regional-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
output_languages:
  - en-GB
`,
    )
    seedTextAndSpeechBook(booksDir, "regional-core-tts")

    const runner = createStageRunner()
    await runner.run(
      "regional-core-tts",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "translate",
      },
      { emit: () => undefined },
    )

    const storage = createBookStorage("regional-core-tts", booksDir)
    try {
      expect(storage.getLatestNodeData("text-catalog-translation", "en-GB")).toBeNull()
      expect(storage.getLatestNodeData("core-tts-catalog", "en-GB")?.data).toMatchObject({
        language: "en-GB",
        entries: [{ id: "pg001_t001", displayText: "Hello world" }],
      })
    } finally {
      storage.close()
    }
  })
})

describe("createStageRunner speech Gemini partial failures", () => {
  let tmpDir = ""

  beforeEach(() => {
    generateSpeechFileMock.mockReset()
    generateSpeechFileMock.mockResolvedValue(undefined)
    transcribeWithWhisperMock.mockReset()
    transcribeWithWhisperMock.mockResolvedValue({
      text: "Hello world",
      duration: 1,
      words: [
        { word: "Hello", start: 0, end: 0.45 },
        { word: "world", start: 0.45, end: 0.9 },
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("records an active step as error when a stage throws before emitting step-error", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-translate-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
output_languages:
  - fr
`
    )
    seedTextAndSpeechBook(booksDir, "catalog-translation-failure")

    easyReadGenerateObjectMock.mockImplementation(async (options: {
      context?: { texts?: Array<{ text: string }> }
      validate?: (raw: unknown, context: unknown) => { valid: boolean; errors: string[] }
    }) => {
      const invalid = { translations: [] }
      const validation = options.validate?.(invalid, options.context)
      if (validation && !validation.valid) {
        throw new Error(validation.errors.join("\n"))
      }
      return { object: invalid, usage: { inputTokens: 1, outputTokens: 1 } }
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await expect(
      runner.run(
        "catalog-translation-failure",
        {
          booksDir,
          credentials: { openai: { apiKey: "sk-test" } },
          promptsDir,
          configPath,
          fromStage: "translate",
          toStage: "translate",
        },
        { emit: (event) => events.push(event) }
      )
    ).rejects.toThrow("Expected 1 translations but got 0")

    expect(
      events.some(
        (event) =>
          event.type === "step-error" &&
          event.step === "catalog-translation" &&
          event.error.includes("Expected 1 translations but got 0")
      )
    ).toBe(true)

    const storage = createBookStorage("catalog-translation-failure", booksDir)
    try {
      const catalogTranslationStep = storage
        .getStepRuns()
        .find((step) => step.step === "catalog-translation")
      expect(catalogTranslationStep?.status).toBe("error")
      expect(catalogTranslationStep?.error).toContain("Expected 1 translations but got 0")
    } finally {
      storage.close()
    }
  })

  it("completes the Gemini TTS step with gaps when some audio items permanently fail", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-tts-failure")

    // A non-retryable error (not a 429 or a transient 5xx/empty-audio) fails
    // the item immediately, standing in for an item that never converts.
    generateSpeechFileMock.mockRejectedValueOnce(
      new Error("Gemini TTS request failed (400): request rejected")
    )

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "gemini-tts-failure",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    // The step completes with gaps rather than erroring, so the stage finishes
    // and downstream export isn't blocked by a stray failed item.
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) => event.type === "step-error" && event.step === "tts"
      )
    ).toBe(false)

    const storage = createBookStorage("gemini-tts-failure", booksDir)
    try {
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).toBe("done")
      // The failed item is persisted per-language for the Speech view to surface.
      const ttsOutput = storage.getLatestNodeData("tts", "en")?.data as
        | { failed?: Array<{ textId: string; error: string }> }
        | undefined
      expect(ttsOutput?.failed?.length).toBeGreaterThan(0)
    } finally {
      storage.close()
    }
  })

  it("retries rate-limited Gemini TTS items and completes the step when a retry succeeds", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-tts-retry")

    generateSpeechFileMock
      .mockRejectedValueOnce(
        new Error(
          "Gemini TTS request failed (429): Quota exceeded. Please retry in 0s."
        )
      )
      .mockResolvedValueOnce(undefined)

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "gemini-tts-retry",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(generateSpeechFileMock).toHaveBeenCalledTimes(2)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.type === "step-error" &&
          event.step === "tts" &&
          event.error.includes("Missing Gemini audio can be generated one by one")
      )
    ).toBe(false)

    const storage = createBookStorage("gemini-tts-retry", booksDir)
    try {
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).toBe("done")
    } finally {
      storage.close()
    }
  })

  it("retries transient Gemini TTS server errors and completes the step when a retry succeeds", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-tts-transient")

    // A transient 500 on the first attempt, then success — the item must not
    // be permanently failed just because Gemini had a server-side hiccup.
    generateSpeechFileMock
      .mockRejectedValueOnce(
        new Error(
          "Gemini TTS request failed (500): An internal error has occurred. Please retry"
        )
      )
      .mockResolvedValueOnce(undefined)

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "gemini-tts-transient",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(generateSpeechFileMock).toHaveBeenCalledTimes(2)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) => event.type === "step-error" && event.step === "tts"
      )
    ).toBe(false)

    const storage = createBookStorage("gemini-tts-transient", booksDir)
    try {
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).toBe("done")
    } finally {
      storage.close()
    }
  })

  it("fails the speech step before any synthesis when a provider credential is missing", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: elevenlabs
  providers:
    elevenlabs:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "elevenlabs-tts-missing-key")
    // The synthesizer factory falls back to the ambient key, so a developer
    // machine with one exported would otherwise pass the pre-flight.
    vi.stubEnv("ELEVENLABS_API_KEY", "")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await expect(
      runner.run(
        "elevenlabs-tts-missing-key",
        {
          booksDir,
          credentials: { openai: { apiKey: "sk-test" } },
          promptsDir,
          configPath,
          fromStage: "translate",
          toStage: "speech",
        },
        { emit: (event) => events.push(event) }
      )
    ).rejects.toThrow(/Provider "elevenlabs" requires API key/)

    // The credential is checked once, before any item is admitted: no synthesis
    // is attempted and no per-item failure is logged.
    expect(generateSpeechFileMock).not.toHaveBeenCalled()
    const db = openBookDb(
      path.join(booksDir, "elevenlabs-tts-missing-key", "elevenlabs-tts-missing-key.db")
    )
    try {
      expect(db.all("SELECT request_id FROM llm_log WHERE step = 'tts'")).toHaveLength(0)
    } finally {
      db.close()
    }

    // The Speech view is driven by step-error, not by the rejection: assert the
    // step goes red carrying the provider message, so the user sees one
    // actionable error rather than a bare run failure with no step highlighted.
    const ttsErrors = events.filter(
      (event) => event.type === "step-error" && event.step === "tts"
    )
    expect(ttsErrors).toHaveLength(1)
    expect((ttsErrors[0] as { error: string }).error).toMatch(
      /Provider "elevenlabs" requires API key/
    )
  })

  it("fails fast when only the secondary narrator's provider credential is missing", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    // The primary narrator routes to OpenAI (key present); only the secondary
    // routes to ElevenLabs. A secondary voice carries its own provider, so
    // deriving the pre-flight set from the language's routing would miss it
    // entirely and fall back to one logged failure per item.
    writeSecondarySpeechConfig(configPath, {
      provider: "elevenlabs",
      voice: "Rachel",
    })
    seedTextAndSpeechBook(booksDir, "secondary-tts-missing-key")
    vi.stubEnv("ELEVENLABS_API_KEY", "")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await expect(
      runner.run(
        "secondary-tts-missing-key",
        {
          booksDir,
          credentials: { openai: { apiKey: "sk-test" } },
          promptsDir,
          configPath,
          fromStage: "translate",
          toStage: "speech",
        },
        { emit: (event) => events.push(event) }
      )
    ).rejects.toThrow(/Provider "elevenlabs" requires API key/)

    // Nothing is synthesized — not even the primary voice, whose credential is
    // fine. One missing key fails the run before any item is admitted.
    expect(generateSpeechFileMock).not.toHaveBeenCalled()
    const db = openBookDb(
      path.join(booksDir, "secondary-tts-missing-key", "secondary-tts-missing-key.db")
    )
    try {
      expect(db.all("SELECT request_id FROM llm_log WHERE step = 'tts'")).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it("fails before any page-batched synthesis when the Gemini credential is missing", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    // batch_by_page routes page-scoped Gemini entries into pageGroups, which
    // deliberately skip the per-entry reuse check — so this is the path that
    // reaches the pre-flight via the pageGroups half of its provider set.
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  batch_by_page: true
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-batched-missing-key")
    vi.stubEnv("GEMINI_API_KEY", "")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await expect(
      runner.run(
        "gemini-batched-missing-key",
        {
          booksDir,
          credentials: { openai: { apiKey: "sk-test" } },
          promptsDir,
          configPath,
          fromStage: "translate",
          toStage: "speech",
        },
        { emit: (event) => events.push(event) }
      )
    ).rejects.toThrow(/Provider "gemini" requires API key/)

    const db = openBookDb(
      path.join(booksDir, "gemini-batched-missing-key", "gemini-batched-missing-key.db")
    )
    try {
      expect(db.all("SELECT request_id FROM llm_log WHERE step = 'tts'")).toHaveLength(0)
    } finally {
      db.close()
    }
    expect(transcribeWithWhisperMock).not.toHaveBeenCalled()
  })

  it("does not require a credential when every entry is reused and there is no work", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: elevenlabs
  providers:
    elevenlabs:
      languages:
        - en
`
    )
    const label = "elevenlabs-tts-all-reused"
    seedTextAndSpeechBook(booksDir, label)

    // A manual recording with its audio file present is reusable outright, so
    // the entry never becomes a work item. With nothing to generate, the
    // pre-flight's provider set is empty and no synthesizer is built — a run
    // that needs no credential must not be failed by the fail-fast check.
    const bookDir = path.join(booksDir, label)
    const audioDir = path.join(bookDir, "audio", "en")
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, "pg001_t001.mp3"), Buffer.from("fake-audio"))
    const storage = createBookStorage(label, booksDir)
    try {
      storage.putNodeData("tts", "en", {
        entries: [
          {
            textId: "pg001_t001",
            language: "en",
            fileName: "pg001_t001.mp3",
            voice: "manual",
            model: "manual",
            cached: true,
            provider: "manual",
          },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    } finally {
      storage.close()
    }
    vi.stubEnv("ELEVENLABS_API_KEY", "")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      label,
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(generateSpeechFileMock).not.toHaveBeenCalled()
    expect(
      events.filter((event) => event.type === "step-error" && event.step === "tts")
    ).toHaveLength(0)
  })

  it("stops admitting TTS items and unwinds without step errors when the run is cancelled", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
concurrency: 1
speech:
  default_provider: gemini
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-tts-cancel")
    // Second catalog entry so there is still work queued when the cancel lands.
    const seedStorage = createBookStorage("gemini-tts-cancel", booksDir)
    try {
      seedStorage.putNodeData("text-catalog", "book", {
        entries: [
          { id: "pg001_t001", text: "Hello world" },
          { id: "pg001_t002", text: "Second entry" },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      seedStorage.putNodeData("core-tts-catalog", "en", {
        language: "en",
        entries: [
          readyCoreTtsEntry("pg001_t001", "Hello world"),
          readyCoreTtsEntry("pg001_t002", "Second entry"),
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    } finally {
      seedStorage.close()
    }

    const controller = new AbortController()
    generateSpeechFileMock.mockImplementation(async () => {
      controller.abort()
      return undefined
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await expect(
      runner.run(
        "gemini-tts-cancel",
        {
          booksDir,
          credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
          promptsDir,
          configPath,
          fromStage: "speech",
          toStage: "speech",
          signal: controller.signal,
        },
        { emit: (event) => events.push(event) }
      )
    ).rejects.toThrow("Run cancelled")

    // The second item must never start once the cancel has landed.
    expect(generateSpeechFileMock).toHaveBeenCalledTimes(1)
    // A cancel is not a failure: no step-error, and no partial tts output committed.
    expect(events.some((event) => event.type === "step-error")).toBe(false)
    const storage = createBookStorage("gemini-tts-cancel", booksDir)
    try {
      expect(storage.getLatestNodeData("tts", "en")).toBeFalsy()
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).not.toBe("error")
    } finally {
      storage.close()
    }
  })

  it("stores word timestamps for generated speech files", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedTextAndSpeechBook(booksDir, "speech-word-timestamps")
    fs.writeFileSync(
      path.join(booksDir, "speech-word-timestamps", "config.yaml"),
      "speech:\n  word_highlighting: true\n",
    )

    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      textId: string
      language: string
      voice: string
      model: string
      provider?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const fileName = `${options.textId}.mp3`
      fs.writeFileSync(path.join(audioDir, fileName), Buffer.from("fake-audio"))
      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "openai",
      }
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "speech-word-timestamps",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(true)
    expect(transcribeWithWhisperMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithWhisperMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "pg001_t001.mp3",
      "sk-test",
      "en",
      "Hello world",
    )

    const storage = createBookStorage("speech-word-timestamps", booksDir)
    try {
      const row = storage.getLatestNodeData("tts-timestamps", "en")
      expect(row).not.toBeNull()
      expect(
        (row?.data as {
          entries: Record<string, { words: Array<{ word: string; start: number; end: number }> }>
        }).entries.pg001_t001.words
      ).toEqual([
        { word: "Hello", start: 0, end: 0.45 },
        { word: "world", start: 0.45, end: 0.9 },
      ])
    } finally {
      storage.close()
    }
  })

  it("records word timestamp failures and completes the step with gaps", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedTextAndSpeechBook(booksDir, "speech-word-timestamps-fail")
    fs.writeFileSync(
      path.join(booksDir, "speech-word-timestamps-fail", "config.yaml"),
      "speech:\n  word_highlighting: true\n",
    )

    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      textId: string
      language: string
      voice: string
      model: string
      provider?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const fileName = `${options.textId}.mp3`
      fs.writeFileSync(path.join(audioDir, fileName), Buffer.from("fake-audio"))
      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "openai",
      }
    })
    // Whisper rejects this item — it must not fail the whole step.
    transcribeWithWhisperMock.mockRejectedValue(new Error("audio_too_short"))

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "speech-word-timestamps-fail",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    // The step completes with gaps rather than erroring, so the Speech view
    // renders (instead of stranding the user on the landing page).
    expect(
      events.some(
        (event) => event.type === "step-error" && event.step === "word-timestamps"
      )
    ).toBe(false)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "word-timestamps"
      )
    ).toBe(true)

    // The failure is persisted so the Speech view can mark it for pruning.
    const storage = createBookStorage("speech-word-timestamps-fail", booksDir)
    try {
      const row = storage.getLatestNodeData("tts-timestamps", "en")
      expect(row).not.toBeNull()
      const data = row?.data as {
        entries: Record<string, unknown>
        failed?: Array<{ textId: string; error: string }>
      }
      expect(data.entries.pg001_t001).toBeUndefined()
      expect(data.failed).toEqual([
        { textId: "pg001_t001", error: expect.stringContaining("audio_too_short"), voiceSlot: "primary" },
      ])
    } finally {
      storage.close()
    }
  })

  it("marks an empty page-batched slice as failed without calling Whisper", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedTextAndSpeechBook(booksDir, "speech-empty-slice")
    fs.writeFileSync(
      path.join(booksDir, "speech-empty-slice", "config.yaml"),
      "speech:\n  word_highlighting: true\n",
    )

    // A canonical 44-byte PCM WAV header with a zero-length data chunk — exactly
    // what page-batched slicing writes for an entry that wasn't spoken (e.g. a
    // bare page number).
    const emptyWav = (): Buffer => {
      const buf = Buffer.alloc(44)
      buf.write("RIFF", 0)
      buf.writeUInt32LE(36, 4)
      buf.write("WAVE", 8)
      buf.write("fmt ", 12)
      buf.writeUInt32LE(16, 16)
      buf.writeUInt16LE(1, 20) // PCM
      buf.writeUInt16LE(1, 22) // mono
      buf.writeUInt32LE(24000, 24)
      buf.writeUInt32LE(48000, 28)
      buf.writeUInt16LE(2, 32)
      buf.writeUInt16LE(16, 34)
      buf.write("data", 36)
      buf.writeUInt32LE(0, 40) // zero samples
      return buf
    }

    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      textId: string
      language: string
      voice: string
      model: string
      provider?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const fileName = `${options.textId}.wav`
      fs.writeFileSync(path.join(audioDir, fileName), emptyWav())
      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "gemini",
      }
    })

    const runner = createStageRunner()
    await runner.run(
      "speech-empty-slice",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    // The empty slice is caught up front — no doomed transcription call.
    expect(transcribeWithWhisperMock).not.toHaveBeenCalled()

    const storage = createBookStorage("speech-empty-slice", booksDir)
    try {
      const row = storage.getLatestNodeData("tts-timestamps", "en")
      const data = row?.data as {
        failed?: Array<{ textId: string; error: string }>
      }
      expect(data.failed).toEqual([
        { textId: "pg001_t001", error: expect.stringContaining("empty"), voiceSlot: "primary" },
      ])
    } finally {
      storage.close()
    }
  })

  it("skips word timestamp generation when speech.word_highlighting is false", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedTextAndSpeechBook(booksDir, "speech-word-highlight-disabled")
    fs.writeFileSync(
      path.join(booksDir, "speech-word-highlight-disabled", "config.yaml"),
      "speech:\n  word_highlighting: false\n",
    )
    const seededStorage = createBookStorage("speech-word-highlight-disabled", booksDir)
    try {
      seededStorage.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_t001: {
            textId: "pg001_t001",
            language: "en",
            duration: 0.9,
            words: [
              { word: "stale", start: 0, end: 0.9 },
            ],
          },
        },
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    } finally {
      seededStorage.close()
    }

    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      textId: string
      language: string
      voice: string
      model: string
      provider?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const fileName = `${options.textId}.mp3`
      fs.writeFileSync(path.join(audioDir, fileName), Buffer.from("fake-audio"))
      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "openai",
      }
    })

    const runner = createStageRunner()
    await runner.run(
      "speech-word-highlight-disabled",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    expect(transcribeWithWhisperMock).not.toHaveBeenCalled()

    const storage = createBookStorage("speech-word-highlight-disabled", booksDir)
    try {
      const row = storage.getLatestNodeData("tts-timestamps", "en")
      expect(row).not.toBeNull()
      // With highlighting disabled, the seeded timestamps are preserved so that
      // manually-calculated entries (via the speech view) survive a speech re-run.
      const entries = (row?.data as {
        entries: Record<string, { words: Array<{ word: string; start: number; end: number }> }>
      }).entries
      expect(entries.pg001_t001?.words).toEqual([{ word: "stale", start: 0, end: 0.9 }])
    } finally {
      storage.close()
    }
  })

  it("generates independent primary and secondary profiles with different providers", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeSecondarySpeechConfig(configPath, {
      provider: "gemini",
      model: "gemini-2.5-flash-preview-tts",
      voice: "Puck",
      label: "Alt Narrator",
    })
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, "config", "voices.yaml"),
      `openai:
  en:
    primary:
      voice: alloy
      label: Narrator

`
    )
    seedTextAndSpeechBook(booksDir, "speech-dual-voice")

    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      textId: string
      language: string
      voice: string
      voiceSlot?: string
      voiceLabel?: string
      model: string
      provider?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const slot = options.voiceSlot ?? "primary"
      const fileName = slot === "secondary" ? `${options.textId}--secondary.mp3` : `${options.textId}.mp3`
      fs.writeFileSync(path.join(audioDir, fileName), Buffer.from("fake-audio"))
      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "openai",
        voiceSlot: slot,
        ...(options.voiceLabel ? { voiceLabel: options.voiceLabel } : {}),
      }
    })

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "speech-dual-voice",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(
      events.some((event) => event.type === "step-complete" && event.step === "tts")
    ).toBe(true)
    // One call per configured slot for the single entry.
    expect(generateSpeechFileMock).toHaveBeenCalledTimes(2)
    expect(generateSpeechFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ voice: "alloy", voiceSlot: "primary", voiceLabel: "Narrator" })
    )
    expect(generateSpeechFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        model: "gemini-2.5-flash-preview-tts",
        voice: "Puck",
        voiceSlot: "secondary",
        voiceLabel: "Alt Narrator",
      })
    )

    const storage = createBookStorage("speech-dual-voice", booksDir)
    try {
      const ttsOutput = storage.getLatestNodeData("tts", "en")?.data as {
        entries: Record<string, { fileName: string; voiceSlot?: string; voiceLabel?: string }>
      }
      const variants = Object.values(ttsOutput.entries).filter(
        (entry) => entry.fileName.startsWith("pg001_t001")
      )
      expect(variants).toHaveLength(2)
      expect(variants.map((entry) => entry.voiceSlot).sort()).toEqual(["primary", "secondary"])
      const primary = variants.find((entry) => entry.voiceSlot === "primary")
      const secondary = variants.find((entry) => entry.voiceSlot === "secondary")
      expect(primary?.fileName).toBe("pg001_t001.mp3")
      expect(secondary?.fileName).toBe("pg001_t001--secondary.mp3")
      expect(primary?.voiceLabel).toBe("Narrator")
      expect(secondary?.voiceLabel).toBe("Alt Narrator")
    } finally {
      storage.close()
    }
  })

  it("reuses cached primary/secondary variants independently across reruns", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeSecondarySpeechConfig(configPath, {
      provider: "openai",
      voice: "shimmer",
      label: "Alt One",
    })
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, "config", "voices.yaml"),
      `openai:
  en:
    primary:
      voice: alloy

`
    )
    seedTextAndSpeechBook(booksDir, "speech-dual-voice-rerun")

    // Mirrors the real generateSpeechFile contract closely enough for the
    // reuse check: it writes the output audio AND a cache entry keyed the
    // same way canReuseSpeechEntry computes it, so a rerun can genuinely
    // exercise the cache-hit path per slot.
    generateSpeechFileMock.mockImplementation(async (options: {
      bookDir: string
      cacheDir: string
      textId: string
      text: string
      language: string
      voice: string
      voiceSlot?: string
      model: string
      instructions: string
      provider?: string
      voiceLabel?: string
    }) => {
      const audioDir = path.join(options.bookDir, "audio", options.language)
      fs.mkdirSync(audioDir, { recursive: true })
      const slot = options.voiceSlot ?? "primary"
      const fileName = slot === "secondary" ? `${options.textId}--secondary.mp3` : `${options.textId}.mp3`
      fs.writeFileSync(path.join(audioDir, fileName), Buffer.from("fake-audio"))

      const cacheKey = computeSpeechCacheKey({
        text: stripEmojis(options.text).trim(),
        voice: options.voice,
        model: options.model,
        instructions: options.instructions,
        provider: options.provider,
      })
      const cacheDir = path.join(options.cacheDir, "tts")
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(path.join(cacheDir, `${cacheKey}.mp3`), Buffer.from("fake-audio"))

      return {
        textId: options.textId,
        language: options.language,
        fileName,
        voice: options.voice,
        model: options.model,
        cached: false,
        provider: options.provider ?? "openai",
        voiceSlot: slot,
        ...(options.voiceLabel ? { voiceLabel: options.voiceLabel } : {}),
      }
    })

    const runner = createStageRunner()
    await runner.run(
      "speech-dual-voice-rerun",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )
    expect(generateSpeechFileMock).toHaveBeenCalledTimes(2)

    // Rerun with no changes: both slots must be reused from cache, so
    // generateSpeechFile is not called again for either variant.
    generateSpeechFileMock.mockClear()
    await runner.run(
      "speech-dual-voice-rerun",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )
    expect(generateSpeechFileMock).not.toHaveBeenCalled()

    // A label-only change must keep both audio files cached while refreshing
    // the metadata used by Studio and exported narrator selectors.
    writeSecondarySpeechConfig(configPath, {
      provider: "openai",
      voice: "shimmer",
      label: "Alt Two",
    })
    await runner.run(
      "speech-dual-voice-rerun",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} },
    )
    expect(generateSpeechFileMock).not.toHaveBeenCalled()
    const storage = createBookStorage("speech-dual-voice-rerun", booksDir)
    try {
      const output = storage.getLatestNodeData("tts", "en")?.data as {
        entries: Array<{ voiceSlot?: string; voiceLabel?: string }>
      }
      expect(
        output.entries.find((entry) => entry.voiceSlot === "secondary")?.voiceLabel,
      ).toBe("Alt Two")
    } finally {
      storage.close()
    }

    // Now invalidate only the secondary voice's cache entry (e.g. its voice
    // config changed) — only the secondary slot should regenerate while the
    // primary variant is reused untouched.
    writeSecondarySpeechConfig(configPath, {
      provider: "openai",
      voice: "nova",
    })
    generateSpeechFileMock.mockClear()
    await runner.run(
      "speech-dual-voice-rerun",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    expect(generateSpeechFileMock).toHaveBeenCalledTimes(1)
    expect(generateSpeechFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ voiceSlot: "secondary" })
    )

    // Finally, invalidate only the PRIMARY voice. Reused entries are collected
    // during the scan pass and regenerated ones after it, so the secondary is
    // now pushed first and push order is [secondary, primary]. The persisted
    // output must still lead with the primary voice — Studio reads the first
    // primary entry to describe the language, and a run in flight serves this
    // same data.
    fs.writeFileSync(
      path.join(tmpDir, "config", "voices.yaml"),
      `openai:
  en:
    primary:
      voice: onyx

`
    )
    generateSpeechFileMock.mockClear()
    await runner.run(
      "speech-dual-voice-rerun",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    expect(generateSpeechFileMock).toHaveBeenCalledTimes(1)
    expect(generateSpeechFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ voiceSlot: "primary" })
    )
    const mixedRunStorage = createBookStorage("speech-dual-voice-rerun", booksDir)
    try {
      const output = mixedRunStorage.getLatestNodeData("tts", "en")?.data as {
        entries: Array<{ textId: string; voiceSlot?: string }>
      }
      expect(
        output.entries.map((entry) => [entry.textId, entry.voiceSlot ?? "primary"]),
      ).toEqual([
        ["pg001_t001", "primary"],
        ["pg001_t001", "secondary"],
      ])
    } finally {
      mixedRunStorage.close()
    }
  })

  it("refreshes the voice label of a reused manual-audio entry without regenerating", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
`,
    )
    // Primary maps to an OpenAI voice carrying a freshly renamed label.
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, "config", "voices.yaml"),
      `openai:
  en:
    primary:
      voice: alloy
      label: Renamed Narrator
`,
    )
    seedTextAndSpeechBook(booksDir, "speech-manual-reuse-label")

    // A previously uploaded manual recording carrying a now-stale label, plus
    // its on-disk audio so the manual reuse guard (file existence) holds.
    const label = "speech-manual-reuse-label"
    const audioDir = path.join(booksDir, label, "audio", "en")
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, "pg001_t001.mp3"), Buffer.from("manual-audio"))
    const seedStorage = createBookStorage(label, booksDir)
    try {
      seedStorage.putNodeData("tts", "en", {
        entries: [
          {
            textId: "pg001_t001",
            language: "en",
            fileName: "pg001_t001.mp3",
            voice: "alloy",
            model: "gpt-4o-mini-tts",
            cached: true,
            provider: "manual",
            voiceSlot: "primary",
            voiceLabel: "Stale Label",
          },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    } finally {
      seedStorage.close()
    }

    const runner = createStageRunner()
    await runner.run(
      label,
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" } },
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    // The manual recording is reused (never regenerated) but its persisted
    // label is refreshed from the currently resolved primary profile.
    expect(generateSpeechFileMock).not.toHaveBeenCalled()
    const storage = createBookStorage(label, booksDir)
    try {
      const ttsOutput = storage.getLatestNodeData("tts", "en")?.data as {
        entries: Record<string, { fileName: string; provider?: string; voiceLabel?: string }>
      }
      const entry = Object.values(ttsOutput.entries).find(
        (e) => e.fileName === "pg001_t001.mp3",
      )
      expect(entry?.provider).toBe("manual")
      expect(entry?.voiceLabel).toBe("Renamed Narrator")
    } finally {
      storage.close()
    }
  })

  it("marks a page-batched group with no speakable text as skipped", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  batch_by_page: true
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-page-batch-skip")

    // Replace the seeded entry with punctuation only. generatePageSpeechFiles
    // filters it out and returns [] without ever reaching the provider, which
    // is the row that used to be logged as an ordinary success.
    const seed = createBookStorage("gemini-page-batch-skip", booksDir)
    try {
      seed.putNodeData("text-catalog", "book", {
        entries: [{ id: "pg001_t001", text: "—" }],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      seed.putNodeData("core-tts-catalog", "en", {
        language: "en",
        generatedAt: "2026-01-01T00:00:00.000Z",
        entries: [readyCoreTtsEntry("pg001_t001", "—")],
      })
    } finally {
      seed.close()
    }

    const runner = createStageRunner()
    await runner.run(
      "gemini-page-batch-skip",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "speech",
        toStage: "speech",
      },
      { emit: () => {} }
    )

    const db = openBookDb(
      path.join(booksDir, "gemini-page-batch-skip", "gemini-page-batch-skip.db")
    )
    try {
      const rows = db.all("SELECT data FROM llm_log WHERE step = 'tts'") as {
        data: string
      }[]
      expect(rows).toHaveLength(1)
      const entry = JSON.parse(rows[0].data) as {
        success: boolean
        cacheHit: boolean
        skippedReason?: string
      }
      // Kept, not dropped — an unexplained gap is worse than a marked one —
      // but marked so it isn't read as a synthesis that happened.
      expect(entry.success).toBe(true)
      expect(entry.skippedReason).toBe("no-speakable-text")
    } finally {
      db.close()
    }
  })
})

describe("processWithConcurrency launch ramp", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("staggers the opening wave by rampMs (one launch per interval)", async () => {
    vi.useFakeTimers()
    const started: number[] = []
    // 4 items, concurrency 4 → whole wave would fire at once without a ramp.
    const done = processWithConcurrency(
      [0, 1, 2, 3],
      4,
      async (i) => {
        started.push(i)
      },
      { rampMs: 100 }
    )

    // Synchronously, only the first item has launched; the loop is parked at the
    // ramp sleep before launching #2.
    expect(started).toEqual([0])
    await vi.advanceTimersByTimeAsync(100)
    expect(started).toEqual([0, 1])
    await vi.advanceTimersByTimeAsync(100)
    expect(started).toEqual([0, 1, 2])
    await vi.advanceTimersByTimeAsync(100)
    expect(started).toEqual([0, 1, 2, 3])
    await done
  })

  it("does not ramp once the pool is full (steady state) or at concurrency 1", async () => {
    vi.useFakeTimers()
    const started: number[] = []
    let resolved = false
    // concurrency 1 → pool is full after the first launch, so the ramp guard
    // (launched < concurrency) never fires. The run completes with only
    // microtask flushing — no timers to advance.
    processWithConcurrency(
      [0, 1, 2],
      1,
      async (i) => {
        started.push(i)
      },
      { rampMs: 100 }
    ).then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(started).toEqual([0, 1, 2])
    expect(resolved).toBe(true)
  })

  it("aborts promptly during the ramp instead of waiting it out", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const started: number[] = []
    const done = processWithConcurrency(
      [0, 1, 2, 3],
      4,
      async (i) => {
        started.push(i)
      },
      { rampMs: 100, runSignal: controller.signal }
    )

    expect(started).toEqual([0]) // parked at the ramp sleep before #2
    controller.abort()
    await expect(done).rejects.toBeInstanceOf(RunCancelledError)
    // The remaining wave never launched — no need to advance the ramp timer.
    expect(started).toEqual([0])
  })
})
