import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { TextCatalogOutput } from "@adt/types"
import { createTextCatalogRoutes } from "./text-catalog.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-text-catalog-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Empty book — enough for routes that only read/write catalog nodes. */
function seedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  storage.close()
}

/** Book with an extracted page AND rendered HTML — buildTextCatalog yields entries. */
function seedRenderedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
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
  } finally {
    storage.close()
  }
}

/** Book extracted but not yet rendered (Storyboard not run) — buildTextCatalog yields nothing. */
function seedUnrenderedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
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
  } finally {
    storage.close()
  }
}

describe("GET /books/:label/text-catalog lazy build", () => {
  it("builds and persists a non-empty catalog on demand", async () => {
    seedRenderedBook("rendered")
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/rendered/text-catalog")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries.length).toBeGreaterThan(0)

    // Persisted so downstream consumers (translate, speech, packaging) can read it.
    const verify = createBookStorage("rendered", tmpDir)
    try {
      expect(verify.getLatestNodeData("text-catalog", "book")).toBeTruthy()
    } finally {
      verify.close()
    }
  })

  it("does not persist an empty catalog (book opened before Storyboard ran)", async () => {
    seedUnrenderedBook("not-rendered")
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/not-rendered/text-catalog")
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()

    // The empty catalog must NOT be written — a persisted empty node would
    // poison Translate (it only rebuilds when the node is absent).
    const verify = createBookStorage("not-rendered", tmpDir)
    try {
      expect(verify.getLatestNodeData("text-catalog", "book")).toBeFalsy()
    } finally {
      verify.close()
    }
  })

  it("returns 404 for a missing book", async () => {
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/ghost/text-catalog")
    expect(res.status).toBe(404)
  })
})

describe("text catalog routes", () => {
  it("stores edited translations as valid text catalog output", async () => {
    const label = "edited-translations"
    seedBook(label)
    const seeded = createBookStorage(label, tmpDir)
    seeded.putNodeData("core-tts-catalog", "es", {
      language: "es",
      entries: [{
        id: "pg001_t001",
        displayText: "¿Lo haces?",
        speechText: "¿Lo haces?",
        changed: false,
        transformations: [],
        status: "ready",
        generation: {
          mode: "unchanged",
          generatedAt: "2026-08-05T00:00:00.000Z",
          enabledTransformations: [],
          sourceTextHash: "source",
          contextHash: "context",
        },
      }],
      generatedAt: "2026-08-05T00:00:00.000Z",
    })
    seeded.putNodeData("accessibility-assessment", "book", { summary: {} })
    seeded.markStepCompleted("core-tts-catalog")
    seeded.markStepCompleted("tts")
    seeded.markStepCompleted("word-timestamps")
    seeded.markStepCompleted("package-web")
    seeded.markStepCompleted("accessibility-assessment")
    seeded.close()
    const app = createTextCatalogRoutes(tmpDir)

    const res = await app.request(`/books/${label}/text-catalog-translation/es`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [{ id: "pg001_t001", text: "¿Lo haces tú?" }],
      }),
    })

    expect(res.status).toBe(200)
    const storage = createBookStorage(label, tmpDir)
    try {
      const translation = storage.getLatestNodeData("text-catalog-translation", "es")
      const parsed = TextCatalogOutput.safeParse(translation?.data)
      expect(parsed.success).toBe(true)
      expect(parsed.data?.entries[0].text).toBe("¿Lo haces tú?")
      expect(parsed.data?.generatedAt).toEqual(expect.any(String))
      expect(storage.getLatestNodeData("core-tts-catalog", "es")?.data).toMatchObject({
        entries: [{
          displayText: "¿Lo haces tú?",
          speechText: null,
          status: "failed",
        }],
      })
      expect(storage.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      for (const step of [
        "core-tts-catalog",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]) {
        expect(storage.getStepRuns().find((run) => run.step === step)).toBeUndefined()
      }
    } finally {
      storage.close()
    }
  })

  it("stores manual speech edits as a new Core TTS language version", async () => {
    const label = "edited-speech"
    seedBook(label)
    const seeded = createBookStorage(label, tmpDir)
    try {
      seeded.putNodeData("core-tts-catalog", "en", {
        language: "en",
        generatedAt: "2026-08-05T00:00:00.000Z",
        entries: [{
          id: "pg001_t001",
          displayText: "25",
          speechText: "twenty five",
          changed: true,
          transformations: ["language-normalization"],
          status: "ready",
          generation: {
            mode: "generated",
            generatedAt: "2026-08-05T00:00:00.000Z",
            enabledTransformations: ["language-normalization"],
            sourceTextHash: "source",
            contextHash: "context",
          },
        }],
      })
      seeded.putNodeData("tts", "en", {
        entries: [{
          textId: "pg001_t001",
          language: "en",
          fileName: "pg001_t001.mp3",
          voice: "alloy",
          model: "gpt-4o-mini-tts",
          cached: false,
          provider: "openai",
        }],
        generatedAt: "2026-08-05T00:00:00.000Z",
      })
      seeded.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_t001: {
            textId: "pg001_t001",
            language: "en",
            words: [{ word: "twenty", start: 0, end: 0.5 }],
            duration: 0.5,
          },
        },
        generatedAt: "2026-08-05T00:00:00.000Z",
      })
      seeded.putNodeData("accessibility-assessment", "book", { summary: {} })
      seeded.markStepCompleted("tts")
      seeded.markStepCompleted("word-timestamps")
      seeded.markStepCompleted("package-web")
      seeded.markStepCompleted("accessibility-assessment")
    } finally {
      seeded.close()
    }

    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request(
      `/books/${label}/core-tts-catalog/en/pg001_t001`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechText: "twenty-five" }),
      },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).version).toBe(2)

    const storage = createBookStorage(label, tmpDir)
    try {
      const current = storage.getLatestNodeData("core-tts-catalog", "en")
      expect(current?.version).toBe(2)
      expect(current?.data).toMatchObject({
        entries: [{ speechText: "twenty-five", generation: { mode: "manual" } }],
      })
      expect((storage.getLatestNodeData("tts", "en")?.data as { entries: unknown[] }).entries).toEqual([])
      expect(
        (storage.getLatestNodeData("tts-timestamps", "en")?.data as { entries: Record<string, unknown> }).entries,
      ).toEqual({})
      expect(storage.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      for (const step of [
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]) {
        expect(storage.getStepRuns().find((run) => run.step === step)).toBeUndefined()
      }
      expect(storage.setCurrentNodeVersion("core-tts-catalog", "en", 1)).toBe(true)
    } finally {
      storage.close()
    }
  })

  it("preserves an uploaded recording when its speech text is edited", async () => {
    const label = "manual-speech-audio"
    seedBook(label)
    const seeded = createBookStorage(label, tmpDir)
    try {
      seeded.putNodeData("core-tts-catalog", "en", {
        language: "en",
        generatedAt: "2026-08-05T00:00:00.000Z",
        entries: [{
          id: "pg001_t001",
          displayText: "Hello",
          speechText: "Hello",
          changed: false,
          transformations: [],
          status: "ready",
          generation: {
            mode: "unchanged",
            generatedAt: "2026-08-05T00:00:00.000Z",
            enabledTransformations: [],
            sourceTextHash: "source",
            contextHash: "context",
          },
        }],
      })
      seeded.putNodeData("tts", "en", {
        entries: [{
          textId: "pg001_t001",
          language: "en",
          fileName: "uploaded.mp3",
          voice: "uploaded",
          model: "uploaded",
          cached: false,
          provider: "manual",
        }],
        generatedAt: "2026-08-05T00:00:00.000Z",
      })
    } finally {
      seeded.close()
    }

    const app = createTextCatalogRoutes(tmpDir)
    const response = await app.request(
      `/books/${label}/core-tts-catalog/en/pg001_t001`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechText: "Hello there" }),
      },
    )
    expect(response.status).toBe(200)

    const storage = createBookStorage(label, tmpDir)
    try {
      const tts = storage.getLatestNodeData("tts", "en")
      expect(tts?.version).toBe(1)
      expect(tts?.data).toMatchObject({
        entries: [{ textId: "pg001_t001", provider: "manual" }],
      })
    } finally {
      storage.close()
    }
  })
})
