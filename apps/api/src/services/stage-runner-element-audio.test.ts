import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createStageRunner } from "./stage-runner.js"

const { generateSpeechFileMock, generatePageSpeechFilesMock } = vi.hoisted(() => ({
  generateSpeechFileMock: vi.fn(),
  generatePageSpeechFilesMock: vi.fn(),
}))

vi.mock("@adt/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@adt/pipeline")>("@adt/pipeline")
  return {
    ...actual,
    generatePageSpeechFiles: generatePageSpeechFilesMock,
    generateSpeechFile: generateSpeechFileMock,
  }
})

let tmpDir = ""
let booksDir = ""
let promptsDir = ""
let configPath = ""

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

function writeConfig(speech: string): void {
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
${speech}`,
  )
}

function seedBook(label: string): void {
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
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "",
      sections: [{
        sectionId: "pg001_sec001",
        sectionType: "content",
        backgroundColor: "white",
        textColor: "black",
        pageNumber: 1,
        isPruned: false,
        nodes: [],
      }],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [{
        sectionIndex: 0,
        sectionId: "pg001_sec001",
        sectionType: "content",
        reasoning: "",
        html: '<p data-id="pg001_t001">Hello world</p><p data-id="pg001_im001_audio">Mago</p><p data-id="pg003_im007_audio">Legacy caption</p>',
      }],
    })
    storage.putNodeData("element-audio", "pg001", {
      entries: [{ nodeId: "pg001_im001", text: "Mago" }],
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
    storage.putNodeData("text-catalog", "book", {
      entries: [
        { id: "pg001_t001", text: "Hello world" },
        { id: "pg001_im001_audio", text: "Mago" },
        { id: "pg003_im007_audio", text: "Legacy caption" },
      ],
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
    storage.putNodeData("core-tts-catalog", "en", {
      language: "en",
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        readyCoreTtsEntry("pg001_t001", "Hello world"),
        readyCoreTtsEntry("pg001_im001_audio", "Mago"),
        readyCoreTtsEntry("pg003_im007_audio", "Legacy caption"),
      ],
    })
  } finally {
    storage.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-element-audio-wiring-"))
  booksDir = path.join(tmpDir, "books")
  promptsDir = path.join(tmpDir, "prompts")
  configPath = path.join(tmpDir, "config.yaml")
  fs.mkdirSync(promptsDir, { recursive: true })
  for (const name of ["image_captioning", "translation", "core_tts_preparation", "easy_read"]) {
    fs.writeFileSync(path.join(promptsDir, `${name}.liquid`), "Test prompt")
  }
  generateSpeechFileMock.mockReset()
  generatePageSpeechFilesMock.mockReset()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("createStageRunner element-audio wiring", () => {
  it("keeps authored audio out of a Gemini page batch and a legacy _audio caption in", async () => {
    writeConfig(`  default_provider: gemini
  batch_by_page: true
  providers:
    gemini:
      languages:
        - en
`)
    seedBook("element-audio-batch")

    generatePageSpeechFilesMock.mockImplementation(async (options: {
      entries: Array<{ id: string; text: string }>
      language: string
    }) => options.entries.map((entry) => ({
      textId: entry.id,
      language: options.language,
      fileName: `${entry.id}.mp3`,
      voice: "Puck",
      model: "gemini-2.5-flash-preview-tts",
      cached: false,
      provider: "gemini",
    })))

    const runner = createStageRunner()
    await runner.run(
      "element-audio-batch",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, gemini: { apiKey: "gm-test" } },
        promptsDir,
        configPath,
        fromStage: "speech",
        toStage: "speech",
      },
      { emit: () => undefined },
    )

    const batchedIds = generatePageSpeechFilesMock.mock.calls.flatMap(
      ([options]) => (options as { entries: Array<{ id: string }> }).entries.map((entry) => entry.id),
    )
    expect(batchedIds).toContain("pg001_t001")
    expect(batchedIds).toContain("pg003_im007_audio")
    expect(batchedIds).not.toContain("pg001_im001_audio")
  })

  it("skips authored audio in ElevenLabs neighbour context but keeps a legacy _audio caption", async () => {
    writeConfig(`  default_provider: elevenlabs
  elevenlabs_use_context: true
  providers:
    elevenlabs:
      languages:
        - en
`)
    seedBook("element-audio-context")

    generateSpeechFileMock.mockImplementation(async (options: {
      textId: string
      language: string
    }) => ({
      textId: options.textId,
      language: options.language,
      fileName: `${options.textId}.mp3`,
      voice: "Rachel",
      model: "eleven_multilingual_v2",
      cached: false,
      provider: "elevenlabs",
    }))

    const runner = createStageRunner()
    await runner.run(
      "element-audio-context",
      {
        booksDir,
        credentials: { openai: { apiKey: "sk-test" }, elevenlabs: { apiKey: "el-test" } },
        promptsDir,
        configPath,
        fromStage: "speech",
        toStage: "speech",
      },
      { emit: () => undefined },
    )

    const calls = generateSpeechFileMock.mock.calls.map(
      ([options]) => options as {
        textId: string
        elevenLabsPreviousText?: string
        elevenLabsNextText?: string
      },
    )
    const real = calls.find((call) => call.textId === "pg001_t001")
    const legacy = calls.find((call) => call.textId === "pg003_im007_audio")
    expect(real?.elevenLabsNextText).toBe("Legacy caption")
    expect(legacy?.elevenLabsPreviousText).toBe("Hello world")
  })
})
