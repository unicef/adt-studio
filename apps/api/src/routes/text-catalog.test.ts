import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { catalogOutputs, editSourceSignature } from "../services/catalog-output-service.js"
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
    storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionId: "pg001_sec001",
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

describe("GET /books/:label/text-catalog projection", () => {
  it("builds a non-empty read model without persisting on open", async () => {
    seedRenderedBook("rendered")
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/rendered/text-catalog")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries.length).toBeGreaterThan(0)

    // Opening the view must not create entity versions.
    const verify = createBookStorage("rendered", tmpDir)
    try {
      expect(verify.getLatestNodeData("text-catalog", "book")).toBeNull()
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
    seedRenderedBook(label)
    fs.writeFileSync(path.join(tmpDir, label, "config.yaml"), "output_languages: [en, es]\n")
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
    const guardStore = createBookStorage(label, tmpDir)
    const sourceSignature = editSourceSignature(catalogOutputs(guardStore, label, tmpDir, path.resolve("prompts")), "translation", "es")
    guardStore.close()

    const res = await app.request(`/books/${label}/text-catalog-translation/es`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [{ id: "pg001_t001", text: "¿Lo haces tú?" }], baseVersion: 0, sourceVersion: 0, sourceSignature,
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
          displayText: "¿Lo haces?",
          speechText: "¿Lo haces?",
          status: "ready",
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
        expect(storage.getStepRuns().find((run) => run.step === step)).toMatchObject({ status: "done" })
      }
    } finally {
      storage.close()
    }
  })

  it("stores manual speech edits as a new Core TTS language version", async () => {
    const label = "edited-speech"
    seedRenderedBook(label)
    fs.writeFileSync(path.join(tmpDir, label, "config.yaml"), "output_languages: [en, es]\n")
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
    const read = await (await app.request(`/books/${label}/text-catalog`)).json()
    const res = await app.request(
      `/books/${label}/core-tts-catalog/en/pg001_t001`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechText: "twenty-five", baseVersion: 1, sourceSignature: read.speechTexts.en.sourceSignature }),
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
      expect(storage.getLatestNodeData("tts", "en")?.version).toBe(1)
      expect((storage.getLatestNodeData("tts", "en")?.data as { entries: unknown[] }).entries).toHaveLength(1)
      expect(
        (storage.getLatestNodeData("tts-timestamps", "en")?.data as { entries: Record<string, unknown> }).entries,
      ).toHaveProperty("pg001_t001")
      expect(storage.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      for (const step of [
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]) {
        expect(storage.getStepRuns().find((run) => run.step === step)).toMatchObject({ status: "done" })
      }
      expect(storage.setCurrentNodeVersion("core-tts-catalog", "en", 1)).toBe(true)
    } finally {
      storage.close()
    }
  })

  it("preserves an uploaded recording when its speech text is edited", async () => {
    const label = "manual-speech-audio"
    seedRenderedBook(label)
    fs.writeFileSync(path.join(tmpDir, label, "config.yaml"), "output_languages: [en, es]\n")
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
    const read = await (await app.request(`/books/${label}/text-catalog`)).json()
    const response = await app.request(
      `/books/${label}/core-tts-catalog/en/pg001_t001`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speechText: "Hello there", baseVersion: 1, sourceSignature: read.speechTexts.en.sourceSignature }),
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

describe("independent speech-entry saves in one versioned language catalog", () => {
  function seedSpeechCatalog(itemId = "en") {
    const label = "speech-entry-merge"
    seedRenderedBook(label)
    const storage = createBookStorage(label, tmpDir)
    const entries = ["pg001_t001", "pg001_t002"].map((id, index) => ({
      id, displayText: index === 0 ? "Hello world" : "Another sentence", speechText: index === 0 ? "Hello world" : "Another sentence",
      changed: false, transformations: [], status: "ready", retainedLegacyNote: `Keep ${id}`,
      generation: { mode: "unchanged", generatedAt: "before", enabledTransformations: [], sourceTextHash: "source", contextHash: "context" },
    }))
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", reasoning: "", html: '<p data-id="pg001_t001">Hello world</p><p data-id="pg001_t002">Another sentence</p>' }] })
    const catalog = { language: itemId.replace("_", "-"), generatedAt: "before", entries, retainedLegacyNote: "Keep catalog metadata" }
    storage.putNodeData("core-tts-catalog", itemId, catalog)
    storage.close()
    const app = createTextCatalogRoutes(tmpDir)
    const read = async () => (await (await app.request(`/books/${label}/text-catalog`)).json()).speechTexts
    const save = (id: string, speechText: string, baseVersion: number, sourceSignature: string) => app.request(`/books/${label}/core-tts-catalog/${itemId.replace("_", "-")}/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speechText, baseVersion, sourceSignature }),
    })
    return { label, app, catalog, read, save }
  }

  it("merges two independently loaded entries while preserving unrelated current metadata and history", async () => {
    const { label, catalog, read, save } = seedSpeechCatalog()
    const guard = (await read()).en
    const first = await save("pg001_t001", "Manual first", guard.version, guard.sourceSignature)
    expect(first.status).toBe(200)
    expect((await first.json()).version).toBe(2)
    const second = await save("pg001_t002", "Manual second", guard.version, guard.sourceSignature)
    expect(second.status).toBe(200)
    expect((await second.json()).version).toBe(3)
    const storage = createBookStorage(label, tmpDir)
    try {
      const current = storage.getLatestNodeData("core-tts-catalog", "en")!
      expect(current.data).toMatchObject({ retainedLegacyNote: "Keep catalog metadata", entries: [
        { id: "pg001_t001", speechText: "Manual first", retainedLegacyNote: "Keep pg001_t001" },
        { id: "pg001_t002", speechText: "Manual second", retainedLegacyNote: "Keep pg001_t002" },
      ] })
      expect(storage.getAllNodeVersions("core-tts-catalog", "en")[0].data).toEqual(catalog)
    } finally { storage.close() }
  })

  it("rejects a stale same-entry writer and leaves the successful edit intact", async () => {
    const { label, read, save } = seedSpeechCatalog()
    const guard = (await read()).en
    expect((await save("pg001_t001", "First writer", guard.version, guard.sourceSignature)).status).toBe(200)
    const storage = createBookStorage(label, tmpDir)
    const before = storage.getNodeVersionFingerprint()
    expect((await save("pg001_t001", "Stale writer", guard.version, guard.sourceSignature)).status).toBe(409)
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
    storage.close()
  })

  it.each(["future", "missing", "malformed", "duplicate-history", "duplicate-current", "source", "exclusion", "restored-future"])("rejects %s evidence without publishing a version", async mode => {
    const { label, catalog, read, save } = seedSpeechCatalog()
    const guard = (await read()).en
    const storage = createBookStorage(label, tmpDir)
    let baseVersion = guard.version
    if (mode === "future") baseVersion = 5
    if (mode === "missing") baseVersion = 0
    if (mode === "malformed" || mode === "duplicate-history") {
      baseVersion = storage.putNodeData("core-tts-catalog", "en", mode === "malformed" ? { invalid: true } : { ...catalog, entries: [catalog.entries[0], catalog.entries[0]] })
      storage.putNodeData("core-tts-catalog", "en", catalog)
    }
    if (mode === "duplicate-current") storage.putNodeData("core-tts-catalog", "en", { ...catalog, entries: [catalog.entries[0], catalog.entries[0]] })
    if (mode === "source") storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", reasoning: "", html: '<p data-id="pg001_t001">Changed source</p><p data-id="pg001_t002">Another sentence</p>' }] })
    if (mode === "exclusion") fs.writeFileSync(path.join(tmpDir, label, "config.yaml"), "speech:\n  excluded_text_ids: [pg001_t001]\n")
    if (mode === "restored-future") { baseVersion = storage.putNodeData("core-tts-catalog", "en", catalog); storage.setCurrentNodeVersion("core-tts-catalog", "en", 1) }
    const before = storage.getNodeVersionFingerprint()
    expect((await save("pg001_t001", "Unsafe edit", baseVersion, guard.sourceSignature)).status).toBe(409)
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
    storage.close()
  })

  it("compares the current restored branch with its real historical baseline", async () => {
    const { label, catalog, read, save } = seedSpeechCatalog()
    const guard = (await read()).en
    const storage = createBookStorage(label, tmpDir)
    storage.putNodeData("core-tts-catalog", "en", { ...catalog, entries: [{ ...catalog.entries[0], speechText: "Abandoned target" }, catalog.entries[1]] })
    storage.setCurrentNodeVersion("core-tts-catalog", "en", 1)
    storage.putNodeData("core-tts-catalog", "en", { ...catalog, entries: [catalog.entries[0], { ...catalog.entries[1], speechText: "Current neighbor" }] })
    expect((await save("pg001_t001", "Manual target", guard.version, guard.sourceSignature)).status).toBe(200)
    expect(storage.getLatestNodeData("core-tts-catalog", "en")?.data).toMatchObject({ entries: [{ speechText: "Manual target" }, { speechText: "Current neighbor" }] })
    expect(storage.getAllNodeVersions("core-tts-catalog", "en")[1].data).toMatchObject({ entries: [{ speechText: "Abandoned target" }, { speechText: "Another sentence" }] })
    storage.close()
  })

  it("keeps legacy locale saves in their actual version namespace", async () => {
    const { label, read, save } = seedSpeechCatalog("pt_BR")
    const guard = (await read()).pt_BR
    expect((await save("pg001_t001", "Primeiro", guard.version, guard.sourceSignature)).status).toBe(200)
    expect((await save("pg001_t002", "Segundo", guard.version, guard.sourceSignature)).status).toBe(200)
    const storage = createBookStorage(label, tmpDir)
    expect(storage.getLatestNodeData("core-tts-catalog", "pt_BR")?.version).toBe(3)
    expect(storage.getLatestNodeData("core-tts-catalog", "pt-BR")).toBeNull()
    storage.close()
  })

  it("rejects a legacy guard when another canonical namespace has the same numeric version", async () => {
    const { label, catalog, read, save } = seedSpeechCatalog("pt_BR")
    const legacy = (await read()).pt_BR
    const storage = createBookStorage(label, tmpDir)
    storage.putNodeData("core-tts-catalog", "pt-BR", catalog)
    const before = storage.getNodeVersionFingerprint()
    expect((await save("pg001_t001", "Wrong namespace", legacy.version, legacy.sourceSignature)).status).toBe(409)
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
    const current = (await read())["pt-BR"]
    expect((await save("pg001_t001", "Correct namespace", current.version, current.sourceSignature)).status).toBe(200)
    expect(storage.getLatestNodeData("core-tts-catalog", "pt_BR")?.data).toEqual(catalog)
    expect(storage.getLatestNodeData("core-tts-catalog", "pt-BR")?.version).toBe(2)
    storage.close()
  })
})
