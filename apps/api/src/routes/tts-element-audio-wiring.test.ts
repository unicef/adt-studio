import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

const mocks = vi.hoisted(() => ({
  speechPageId: vi.fn(),
  findAdjacentSpeechText: vi.fn(),
  generateSpeechFile: vi.fn(),
  actual: {
    speechPageId: undefined as unknown as (...args: never[]) => unknown,
    findAdjacentSpeechText: undefined as unknown as (...args: never[]) => unknown,
  },
}))

vi.mock("@adt/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@adt/pipeline")>("@adt/pipeline")
  mocks.actual.speechPageId = actual.speechPageId
  mocks.actual.findAdjacentSpeechText = actual.findAdjacentSpeechText
  return {
    ...actual,
    generateSpeechFile: mocks.generateSpeechFile,
    speechPageId: (...args: Parameters<typeof actual.speechPageId>) => mocks.speechPageId(...args),
    findAdjacentSpeechText: (...args: Parameters<typeof actual.findAdjacentSpeechText>) =>
      mocks.findAdjacentSpeechText(...args),
  }
})

import { createTTSRoutes } from "./tts.js"

let tmpDir = ""
let configPath = ""

function writeConfig(provider: string, extra = ""): void {
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: ${provider}
  providers:
    ${provider}:
      languages:
        - en
${extra}`,
  )
}

function seedBook(label: string): void {
  const entries = [
    { id: "pg001_t001", text: "Hello world" },
    { id: "pg001_im001_audio", text: "Mago" },
    { id: "pg003_im007_audio", text: "Legacy caption" },
  ]
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("metadata", "book", {
      title: "Test Book",
      authors: ["Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    })
    storage.putNodeData("text-catalog", "book", {
      entries,
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
    storage.putNodeData("core-tts-catalog", "en", {
      language: "en",
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: entries.map((entry) => ({
        id: entry.id,
        displayText: entry.text,
        speechText: entry.text,
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
      })),
    })
    storage.putNodeData("element-audio", "pg001", {
      entries: [{ nodeId: "pg001_im001", text: "Mago" }],
      generatedAt: "2026-01-01T00:00:00.000Z",
    })
  } finally {
    storage.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tts-element-audio-wiring-"))
  configPath = path.join(tmpDir, "config.yaml")
  mocks.speechPageId.mockReset()
  mocks.findAdjacentSpeechText.mockReset()
  mocks.generateSpeechFile.mockReset()
  mocks.speechPageId.mockImplementation(mocks.actual.speechPageId)
  mocks.findAdjacentSpeechText.mockImplementation(mocks.actual.findAdjacentSpeechText)
  mocks.generateSpeechFile.mockImplementation(async (options: {
    textId: string
    language: string
    voice: string
    model: string
  }) => ({
    textId: options.textId,
    language: options.language,
    fileName: `${options.textId}.mp3`,
    voice: options.voice,
    model: options.model,
    cached: false,
  }))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("generate-one element-audio wiring", () => {
  it("passes the artifact-derived set to speechPageId", async () => {
    writeConfig("gemini")
    seedBook("route-page-id")
    const app = createTTSRoutes(tmpDir, configPath)

    const response = await app.request("/books/route-page-id/tts/generate-one", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Gemini-API-Key": "gm-test" },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(response.status).toBe(200)
    const set = mocks.speechPageId.mock.calls.at(-1)?.[2] as Set<string> | undefined
    expect(set).toBeInstanceOf(Set)
    expect(set?.has("pg001_im001_audio")).toBe(true)
  })

  it("passes the artifact-derived set to findAdjacentSpeechText", async () => {
    writeConfig("elevenlabs", "  elevenlabs_use_context: true\n")
    seedBook("route-context")
    const app = createTTSRoutes(tmpDir, configPath)

    const response = await app.request("/books/route-context/tts/generate-one", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ElevenLabs-API-Key": "el-test" },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(response.status).toBe(200)
    const call = mocks.findAdjacentSpeechText.mock.calls.at(-1)
    const set = call?.[4] as Set<string> | undefined
    expect(set).toBeInstanceOf(Set)
    expect(set?.has("pg001_im001_audio")).toBe(true)
  })
})
