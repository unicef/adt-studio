import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, openBookDb } from "@adt/storage"

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}))

vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>("@adt/llm")
  return {
    ...actual,
    createLLMModel: vi.fn(() => ({
      generateObject: generateObjectMock,
    })),
  }
})

import { createEasyReadRoutes } from "./easy-read.js"

let tmpDir: string
let promptsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-easy-read-route-"))
  promptsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-easy-read-prompts-"))
  generateObjectMock.mockReset()
  generateObjectMock.mockImplementation(async (options: {
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

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(promptsDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: "Test Book",
        authors: [],
        publisher: null,
        language_code: "en",
        cover_page_number: null,
        reasoning: "test",
      }),
    ],
  )
  db.close()
}

function seedRenderedEasyReadSource(label: string): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      ["pg001", 1, "Original text"],
    )
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      [
        "page-sectioning",
        "pg001",
        1,
        JSON.stringify({
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
        }),
      ],
    )
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      [
        "web-rendering",
        "pg001",
        1,
        JSON.stringify({
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text_only",
              reasoning: "",
              html: '<section><p data-id="pg001_tx001">Original text</p></section>',
            },
          ],
        }),
      ],
    )
  } finally {
    db.close()
  }
}

function easyReadData(text = "Easy text") {
  return {
    blocks: [
      {
        pageId: "pg001",
        pageNumber: 1,
        sectionId: "pg001_sec001",
        sectionIndex: 0,
        sectionType: "text_only",
        entries: [
          {
            sourceId: "pg001_tx001",
            easyReadId: "pg001_tx001_easy_read",
            originalText: "Original text",
            text,
            pageId: "pg001",
            sectionId: "pg001_sec001",
            sectionIndex: 0,
          },
        ],
      },
    ],
    generatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function twoEntryEasyReadData(firstText = "Easy one", secondText = "Easy two") {
  return {
    blocks: [
      {
        pageId: "pg001",
        pageNumber: 1,
        sectionId: "pg001_sec001",
        sectionIndex: 0,
        sectionType: "text_only",
        entries: [
          {
            sourceId: "pg001_tx001",
            easyReadId: "pg001_tx001_easy_read",
            originalText: "Original one",
            text: firstText,
            pageId: "pg001",
            sectionId: "pg001_sec001",
            sectionIndex: 0,
          },
          {
            sourceId: "pg001_tx002",
            easyReadId: "pg001_tx002_easy_read",
            originalText: "Original two",
            text: secondText,
            pageId: "pg001",
            sectionId: "pg001_sec001",
            sectionIndex: 0,
          },
        ],
      },
    ],
    generatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("easy read routes", () => {
  it("returns null when no Easy Read output exists", async () => {
    createTestBook("empty")
    const app = createEasyReadRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/empty/easy-read")
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("saves a new version and clears downstream nodes", async () => {
    createTestBook("editable")
    const dbPath = path.join(tmpDir, "editable", "editable.db")
    const db = openBookDb(dbPath)
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      ["text-catalog-translation", "es", 1, JSON.stringify({ entries: [], generatedAt: "x" })],
    )
    db.run(
      "INSERT INTO step_runs (step, status, completed_at) VALUES (?, ?, ?)",
      ["catalog-translation", "done", "2026-01-01T00:00:00.000Z"],
    )
    db.close()

    const app = createEasyReadRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/editable/easy-read", {
      method: "PUT",
      body: JSON.stringify(easyReadData("Edited Easy Read")),
      headers: { "Content-Type": "application/json" },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 1 })

    const verify = openBookDb(dbPath)
    try {
      const latest = verify.get(
        "SELECT data FROM node_data WHERE node = ? AND item_id = ?",
        ["easy-read", "book"],
      ) as { data: string }
      expect(JSON.parse(latest.data).blocks[0].entries[0].text).toBe("Edited Easy Read")
      const downstream = verify.all(
        "SELECT node FROM node_data WHERE node = ?",
        ["text-catalog-translation"],
      )
      expect(downstream).toEqual([])
      const stepRuns = verify.all(
        "SELECT step FROM step_runs WHERE step = ?",
        ["catalog-translation"],
      )
      expect(stepRuns).toEqual([])
    } finally {
      verify.close()
    }
  })

  it("keeps unchanged Easy Read speech and removes only changed audio metadata", async () => {
    createTestBook("selective-speech")

    const storage = createBookStorage("selective-speech", tmpDir)
    try {
      storage.putNodeData("easy-read", "book", twoEntryEasyReadData("Easy one", "Easy two"))
      storage.putNodeData("tts", "en", {
        entries: [
          {
            textId: "pg001_tx001_easy_read",
            language: "en",
            fileName: "pg001_tx001_easy_read.wav",
            voice: "Kore",
            model: "gemini-2.5-pro-preview-tts",
            cached: false,
            provider: "gemini",
          },
          {
            textId: "pg001_tx002_easy_read",
            language: "en",
            fileName: "pg001_tx002_easy_read.wav",
            voice: "Kore",
            model: "gemini-2.5-pro-preview-tts",
            cached: false,
            provider: "gemini",
          },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      storage.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_tx001_easy_read: {
            textId: "pg001_tx001_easy_read",
            language: "en",
            words: [{ word: "Easy", start: 0, end: 0.5 }],
            duration: 0.5,
          },
          pg001_tx002_easy_read: {
            textId: "pg001_tx002_easy_read",
            language: "en",
            words: [{ word: "Easy", start: 0, end: 0.5 }],
            duration: 0.5,
          },
        },
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      storage.markStepCompleted("tts")
      storage.markStepCompleted("word-timestamps")
    } finally {
      storage.close()
    }

    const app = createEasyReadRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/selective-speech/easy-read", {
      method: "PUT",
      body: JSON.stringify(twoEntryEasyReadData("Edited one", "Easy two")),
      headers: { "Content-Type": "application/json" },
    })

    expect(res.status).toBe(200)

    const after = createBookStorage("selective-speech", tmpDir)
    try {
      const ttsRow = after.getLatestNodeData("tts", "en")
      expect((ttsRow?.data as { entries: Array<{ textId: string }> }).entries.map((entry) => entry.textId)).toEqual([
        "pg001_tx002_easy_read",
      ])

      const timestampsRow = after.getLatestNodeData("tts-timestamps", "en")
      expect(Object.keys((timestampsRow?.data as { entries: Record<string, unknown> }).entries)).toEqual([
        "pg001_tx002_easy_read",
      ])

      const stepRuns = after.getStepRuns()
      expect(stepRuns.find((step) => step.step === "tts")).toBeUndefined()
      expect(stepRuns.find((step) => step.step === "word-timestamps")).toBeUndefined()
    } finally {
      after.close()
    }
  })

  it("rejects invalid Easy Read payloads", async () => {
    createTestBook("invalid")
    const app = createEasyReadRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/invalid/easy-read", {
      method: "PUT",
      body: JSON.stringify({ blocks: "nope" }),
      headers: { "Content-Type": "application/json" },
    })

    expect(res.status).toBe(400)
  })

  it("regenerates on explicit request even when Easy Read is disabled by default", async () => {
    createTestBook("manual-regenerate")
    seedRenderedEasyReadSource("manual-regenerate")

    const app = createEasyReadRoutes(tmpDir, promptsDir)
    const res = await app.request("/books/manual-regenerate/easy-read/regenerate", {
      method: "POST",
      headers: { "X-OpenAI-Key": "sk-test" },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.blocks[0].entries[0]).toMatchObject({
      sourceId: "pg001_tx001",
      easyReadId: "pg001_tx001_easy_read",
      originalText: "Original text",
      text: "Easy: Original text",
    })
    expect(body.version).toBe(1)
    expect(generateObjectMock).toHaveBeenCalledTimes(1)
  })
})
