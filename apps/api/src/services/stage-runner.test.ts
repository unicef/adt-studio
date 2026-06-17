import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AppConfig, ProgressEvent } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  buildStageRunnerImageClassifyConfig,
  createStageRunner,
} from "./stage-runner.js"

const {
  capturedCaptionInputs,
  captionPageImagesMock,
  generateSpeechFileMock,
  easyReadGenerateObjectMock,
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
        apiKey: "sk-test",
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
        apiKey: "sk-test",
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
      { booksDir, apiKey: "sk-test", promptsDir, configPath, fromStage: "captions", toStage: "captions" },
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
      { booksDir, apiKey: "sk-test", promptsDir, configPath, fromStage: "captions", toStage: "captions" },
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
    const runner = createStageRunner()
    await runner.run(
      "render-only",
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
        fromStage: "storyboard",
        toStage: "storyboard",
        renderOnly: true,
      },
      { emit: (event) => events.push(event) }
    )

    expect(sectionPageMock).not.toHaveBeenCalled()
    expect(renderPageMock).toHaveBeenCalledTimes(1)
    expect(
      events.some(
        (event) =>
          event.type === "step-complete" && event.step === "web-rendering"
      )
    ).toBe(true)
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
        apiKey: "sk-test",
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
        apiKey: "sk-test",
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
        apiKey: "sk-test",
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
          apiKey: "sk-test",
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

  it("keeps Gemini TTS in error state when some audio items fail", async () => {
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

    generateSpeechFileMock.mockRejectedValueOnce(
      new Error("Gemini TTS response did not include audio data")
    )

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "gemini-tts-failure",
      {
        booksDir,
        apiKey: "sk-test",
        geminiApiKey: "gm-test",
        promptsDir,
        configPath,
        fromStage: "translate",
        toStage: "speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(
      events.some(
        (event) =>
          event.type === "step-error" &&
          event.step === "tts" &&
          event.error.includes("Missing Gemini audio can be generated one by one")
      )
    ).toBe(true)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(false)

    const storage = createBookStorage("gemini-tts-failure", booksDir)
    try {
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).toBe("error")
      expect(ttsStep?.error).toContain("Missing Gemini audio can be generated one by one")
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
        apiKey: "sk-test",
        geminiApiKey: "gm-test",
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
        apiKey: "sk-test",
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
        apiKey: "sk-test",
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
})
