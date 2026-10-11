import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import { retainedCoreTts, retainedEasyRead } from "../retained-catalog.js"
import { resolveCoreTtsSpeechCatalog } from "../core-tts.js"
import type { CoreTtsCatalogOutput, EasyReadOutput } from "@adt/types"

let root: string
let storage: Storage
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "retained-catalog-")); storage = createBookStorage("retained", root) })
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })
const entry: CoreTtsCatalogOutput["entries"][number] = { id: "stable", displayText: "Original", speechText: "My pronunciation", status: "ready", source: "manual", changed: true, transformations: [],
  generation: { mode: "manual", generatedAt: "then", enabledTransformations: [], sourceTextHash: "old", contextHash: "old" } }
const block: EasyReadOutput["blocks"][number] = { pageId: "pg001", pageNumber: 1, sectionId: "s1", sectionIndex: 0, sectionType: "text", entries: [{ sourceId: "stable", easyReadId: "stable_easy_read", originalText: "Original", text: "My simple text", source: "manual", pageId: "pg001", sectionId: "s1", sectionIndex: 0 }] }

describe("retired catalog history", () => {
  it("reactivates manual speech by stable ID after retirement and restart without adopting it for a new ID", () => {
    storage.putNodeData("core-tts-catalog", "fr", { language: "fr", entries: [entry], generatedAt: "then" })
    storage.putNodeData("core-tts-catalog", "fr", { language: "fr", entries: [], generatedAt: "retired" })
    storage.close(); storage = createBookStorage("retained", root)
    expect(retainedCoreTts(storage, "fr", ["new-id"])).toBeUndefined()
    const retained = retainedCoreTts(storage, "fr", ["stable"])!
    const output = resolveCoreTtsSpeechCatalog({ entries: [{ id: "stable", text: "Changed source" }], language: "fr", previous: retained,
      config: { modelId: "test", promptName: "test", maxRetries: 0, batchSize: 10, latexToSpeech: true, languageNormalization: true }, profile: { key: "fr", guidance: "French" } })
    expect(output.entries[0]).toEqual(entry)
    expect(storage.getLatestNodeData("core-tts-catalog", "fr")?.version).toBe(2)
    expect(storage.getAllNodeVersions("core-tts-catalog", "fr")).toHaveLength(2)
  })

  it("restores protected Easy Read content into its new location without copying it onto another identity", () => {
    storage.putNodeData("easy-read", "book", { blocks: [block], generatedAt: "then" })
    storage.putNodeData("easy-read", "book", { blocks: [], generatedAt: "retired" })
    const active = { ...block, pageId: "pg002", sectionId: "s2", entries: block.entries.map((entry) => ({ ...entry, pageId: "pg002", sectionId: "s2", originalText: "Changed" })) }
    expect(retainedEasyRead(storage, [active])?.blocks[0].entries[0]).toMatchObject({ text: "My simple text", source: "manual", pageId: "pg002", sectionId: "s2" })
    expect(retainedEasyRead(storage, [{ ...active, entries: [{ ...active.entries[0], sourceId: "new", easyReadId: "new_easy_read" }] }])?.blocks[0].entries).toEqual([])
    expect(storage.getLatestNodeData("easy-read", "book")?.data).toMatchObject({ blocks: [] })
    storage.setCurrentNodeVersion("easy-read", "book", 1)
    expect(retainedEasyRead(storage, [block])?.blocks[0].entries[0].text).toBe("My simple text")
  })
})

it("reactivates retained physical audio and matching timings only when its stable source returns", async () => {
  const { storeImmutableAsset, publishSpeechOutput } = await import("@adt/storage")
  const { reconcileTextCatalog } = await import("../catalog-reconciliation.js")
  storage.putNodeData("glossary", "book", { items: [{ id: "gl001", word: "Term", definition: "Meaning", variations: [], emojis: [] }], generatedAt: "then", pageCount: 0 })
  const active = reconcileTextCatalog(storage)
  const id = active.entries[0].id
  const asset = storeImmutableAsset(storage.bookDir!, ["audio", "en"], id, "mp3", Buffer.from("manual recording"))
  const audio = { textId: id, language: "en", fileName: asset.fileName, audioHash: asset.contentHash, provider: "manual" as const, source: "manual" as const, voice: "uploaded", model: "uploaded", cached: false }
  publishSpeechOutput(storage, "en", { entries: [audio], generatedAt: "then" }, { entries: { [id]: { textId: id, language: "en", audioHash: asset.contentHash, words: [{ word: "Term", start: 0, end: 1 }], duration: 1 } }, generatedAt: "then" })
  storage.putNodeData("glossary", "book", { items: [], generatedAt: "removed", pageCount: 0 })
  reconcileTextCatalog(storage)
  publishSpeechOutput(storage, "en", { entries: [], generatedAt: "retired" })
  reconcileTextCatalog(storage)
  expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({ entries: [] })
  storage.close(); storage = createBookStorage("retained", root)
  storage.setCurrentNodeVersion("glossary", "book", 1)
  reconcileTextCatalog(storage)
  expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({ entries: [audio] })
  expect(storage.getLatestNodeData("tts-timestamps", "en")?.data).toMatchObject({ entries: { [id]: { audioHash: asset.contentHash } } })
  expect(fs.readFileSync(path.join(storage.bookDir!, "audio", "en", asset.fileName), "utf8")).toBe("manual recording")
})

it("recovers translation authorship by exact source ID after restart, honoring the selected current version", async () => {
  const { retainedTranslation } = await import("../retained-catalog.js")
  const manual = { id: "stable", text: "Ma correction", source: "manual" as const }
  storage.putNodeData("text-catalog-translation", "fr", { entries: [manual], generatedAt: "before" })
  storage.putNodeData("text-catalog-translation", "fr", { entries: [], generatedAt: "retired" })
  storage.close(); storage = createBookStorage("retained", root)
  expect(retainedTranslation(storage, "fr", ["new-id"])?.entries).toEqual([])
  expect(retainedTranslation(storage, "fr", ["stable"])?.entries).toEqual([manual])
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")?.version).toBe(2)
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ ...manual, text: "Selected correction" }], generatedAt: "later" })
  expect(retainedTranslation(storage, "fr", ["stable"])?.entries[0].text).toBe("Selected correction")
  storage.setCurrentNodeVersion("text-catalog-translation", "fr", 1)
  expect(retainedTranslation(storage, "fr", ["stable"])?.entries).toEqual([manual])
})
