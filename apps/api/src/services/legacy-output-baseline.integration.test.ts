import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, publishSpeechOutput, restoreSpeechOutput } from "@adt/storage"
import { inputSignature } from "@adt/pipeline"
import type { TTSOutput, TextCatalogOutput, WebRenderingOutput, WordTimestampOutput } from "@adt/types"
import { createOutputRoutes } from "../routes/outputs.js"
import { catalogOutputs } from "./catalog-output-service.js"
import { acceptLegacyOutputBaseline } from "./legacy-output-baseline.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
const label = "legacy"
const prompts = path.resolve("prompts")
const read = () => catalogOutputs(storage, label, root, prompts)
const source = (text = "Hello"): WebRenderingOutput => ({ sections: [{ sectionIndex: 0, sectionId: "owner", sectionType: "text", reasoning: "",
  html: `<section data-section-id="owner">${Array.from({ length: 200 }, (_, i) => `<p data-id="text-${i}">${text} ${i}</p>`).join("")}</section>` }] })

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-legacy-baseline-"))
  storage = createBookStorage(label, root)
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Hello", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 10, height: 10 }, images: [] })
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "owner", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  storage.putNodeData("web-rendering", "pg001", source())
  storage.putNodeData("text-catalog-translation", "fr", { entries: Array.from({ length: 200 }, (_, i) => ({ id: `text-${i}`, text: `Bonjour ${i}`, ...(i % 2 ? { source: "manual" } : {}) })), generatedAt: "legacy" })
  fs.writeFileSync(path.join(storage.bookDir!, "config.yaml"), "output_languages: [en, fr]\n")
  fs.mkdirSync(path.join(storage.bookDir!, "audio/fr"), { recursive: true })
  fs.writeFileSync(path.join(storage.bookDir!, "audio/fr/legacy.mp3"), "retained recording")
  storage.putNodeData("tts", "fr", { entries: ["legacy.mp3", "missing.mp3"].map((fileName, i) => ({ textId: `text-${i}`, language: "fr", fileName, model: "manual", provider: "manual", voice: "manual", cached: false })), generatedAt: "legacy" })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("accepts legacy content in one version per collection on summary read, without provider calls or audio reads/copies", async () => {
  const previous = storage.getLatestNodeData("text-catalog-translation", "fr")!
  const provider = vi.fn(() => { throw new Error("Opening a book must not generate") })
  vi.stubGlobal("fetch", provider)
  const reads = vi.spyOn(fs, "readFileSync")
  const app = createOutputRoutes(root, prompts)
  expect((await app.request(`/books/${label}/outputs/summary`)).status).toBe(200)
  expect(reads.mock.calls.filter(([file]) => String(file).endsWith(".mp3"))).toEqual([])
  expect(fs.readdirSync(path.join(storage.bookDir!, "audio/fr"))).toEqual(["legacy.mp3"])
  const translated = storage.getLatestNodeData("text-catalog-translation", "fr")!
  expect(translated.version).toBe(previous.version + 1)
  const entries = (translated.data as TextCatalogOutput).entries
  expect(entries.map(({ review: _review, ...entry }) => entry)).toEqual((previous.data as TextCatalogOutput).entries)
  expect(entries.every(entry => entry.review?.action === "keep" && !entry.input)).toBe(true)
  expect(storage.getAllNodeVersions("text-catalog-translation", "fr").find(row => row.version === previous.version)?.data).toEqual(previous.data)
  const audio = storage.getLatestNodeData("tts", "fr")!
  expect(audio.version).toBe(2)
  expect((audio.data as TTSOutput).entries[0]).toMatchObject({ fileName: "legacy.mp3", review: { action: "keep" } })
  expect((audio.data as TTSOutput).entries[1].review).toBeUndefined()
  expect(read().filter(output => output.identity.kind === "translation").every(output => output.current && output.protected)).toBe(true)
  const fingerprint = storage.getNodeVersionFingerprint()
  expect((await app.request(`/books/${label}/outputs/summary`)).status).toBe(200)
  expect(storage.getNodeVersionFingerprint()).toEqual(fingerprint)
  expect(provider).not.toHaveBeenCalled()
})

it("keeps protection and warns after a later source change; restoring a legacy version does not reaccept it", () => {
  const original = storage.getLatestNodeData("text-catalog-translation", "fr")!
  expect(acceptLegacyOutputBaseline(storage, read)).toBe(true)
  storage.putNodeData("web-rendering", "pg001", source("Changed"))
  expect(acceptLegacyOutputBaseline(storage, read)).toBe(false)
  expect(read().find(output => output.identity.kind === "translation" && output.identity.id === "text-0"))
    .toMatchObject({ protected: true, current: false, warnings: expect.arrayContaining([{ reason: "source-changed" }]) })
  storage.setCurrentNodeVersion("text-catalog-translation", "fr", original.version)
  expect(acceptLegacyOutputBaseline(storage, read)).toBe(false)
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")!.version).toBe(original.version)
  expect(read().find(output => output.identity.kind === "translation" && output.identity.id === "text-0")?.current).toBe(false)
})

it("does not take over an active writer and retries successfully on the next summary read", async () => {
  const before = storage.getNodeVersionFingerprint()
  const lease = path.join(storage.bookDir!, ".book-writer.json")
  fs.writeFileSync(lease, JSON.stringify({ token: "another-operation", pid: process.pid, host: os.hostname() }))
  const app = createOutputRoutes(root, prompts)
  expect((await app.request(`/books/${label}/outputs/summary`)).status).toBe(200)
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  fs.unlinkSync(lease)
  expect((await app.request(`/books/${label}/outputs/summary`)).status).toBe(200)
  expect(storage.getLatestNodeData("legacy-output-baseline", "book")).toBeTruthy()
})

it("preserves prior input/review evidence and rolls back the whole migration on failure", () => {
  const prior = storage.getLatestNodeData("text-catalog-translation", "fr")!.data as TextCatalogOutput
  const entries = prior.entries.map((entry, i) => i === 0 ? { ...entry, input: { signature: "old", contentHash: "old", references: [] } }
    : i === 1 ? { ...entry, review: { signature: "old", contentHash: "old", action: "keep" as const } } : entry)
  storage.putNodeData("text-catalog-translation", "fr", { ...prior, entries })
  const fingerprint = storage.getNodeVersionFingerprint()
  const put = storage.putNodeData
  const spy = vi.spyOn(storage, "putNodeData").mockImplementation((node, itemId, data) => {
    if (node === "legacy-output-baseline") throw new Error("injected storage failure")
    return put(node, itemId, data)
  })
  expect(() => acceptLegacyOutputBaseline(storage, read)).toThrow("injected storage failure")
  expect(storage.getNodeVersionFingerprint()).toEqual(fingerprint)
  spy.mockRestore()
  acceptLegacyOutputBaseline(storage, read)
  const saved = storage.getLatestNodeData("text-catalog-translation", "fr")!.data as TextCatalogOutput
  expect(saved.entries.slice(0, 2)).toEqual(entries.slice(0, 2))
})

it("preserves the accepted audio baseline through its first ordinary speech publication", () => {
  acceptLegacyOutputBaseline(storage, read)
  const accepted = read().find(output => output.identity.kind === "audio" && output.identity.id === "text-0" && output.identity.language === "fr")!
  expect(accepted).toMatchObject({ current: true, protected: true })
  const retained = storage.getLatestNodeData("tts", "fr")!.data as TTSOutput
  publishSpeechOutput(storage, "fr", retained)
  const entry = (storage.getLatestNodeData("tts", "fr")!.data as TTSOutput).entries[0]
  expect(entry.audioHash).toBeTruthy()
  expect(entry.review).toEqual({ action: "keep", signature: accepted.signature, contentHash: inputSignature(entry.audioHash) })
  expect(read().find(output => output.identity.kind === "audio" && output.identity.id === "text-0" && output.identity.language === "fr"))
    .toMatchObject({ current: true, protected: true })
  expect(fs.readFileSync(path.join(storage.bookDir!, "audio/fr", entry.fileName), "utf8")).toBe("retained recording")
})


it("does not replace older speech input evidence with automatic acceptance", () => {
  const row = storage.getLatestNodeData("tts", "fr")!.data as TTSOutput
  storage.putNodeData("tts", "fr", { ...row, entries: row.entries.map(entry => ({ ...entry, speechInputSignature: "different-source-settings" })) })
  acceptLegacyOutputBaseline(storage, read)
  expect((storage.getLatestNodeData("tts", "fr")!.data as TTSOutput).entries.every(entry => !entry.review)).toBe(true)
  expect(read().find(output => output.identity.kind === "audio" && output.identity.id === "text-0" && output.identity.language === "fr")?.current).toBe(false)
})

it.each(["valid", "stale-review", "stale-content"])("keeps paired timestamp review through snapshot and restore without accepting %s evidence", mode => {
  const audio = storage.getLatestNodeData("tts", "fr")!.data as TTSOutput
  storage.putNodeData("tts", "fr", { ...audio, entries: audio.entries.slice(0, 1) })
  fs.appendFileSync(path.join(storage.bookDir!, "config.yaml"), "core_tts:\n  language_normalization: false\nspeech:\n  word_highlighting: true\n")
  storage.putNodeData("tts-timestamps", "fr", { entries: { "text-0": { textId: "text-0", language: "fr", words: [{ word: "Bonjour", start: 0, end: 1 }], duration: 1 } }, generatedAt: "legacy" })
  acceptLegacyOutputBaseline(storage, read)
  const timingRow = storage.getLatestNodeData("tts-timestamps", "fr")!.data as WordTimestampOutput
  if (mode === "stale-review") timingRow.entries["text-0"].review!.signature = "different-source"
  if (mode === "stale-content") timingRow.entries["text-0"].words[0].word = "Changed timing text"
  if (mode !== "valid") storage.putNodeData("tts-timestamps", "fr", timingRow)
  const acceptedAudio = storage.getLatestNodeData("tts", "fr")!
  const timingStatus = () => read().find(output => output.identity.kind === "timestamps" && output.identity.id === "text-0" && output.identity.language === "fr")!
  expect(timingStatus().current).toBe(mode === "valid")
  publishSpeechOutput(storage, "fr", acceptedAudio.data as TTSOutput)
  expect(timingStatus().current).toBe(mode === "valid")
  expect(restoreSpeechOutput(storage, storage.bookDir!, "fr", acceptedAudio.version)).toBe(true)
  expect(timingStatus().current).toBe(mode === "valid")
  const translations = storage.getLatestNodeData("text-catalog-translation", "fr")!.data as TextCatalogOutput
  storage.putNodeData("text-catalog-translation", "fr", { ...translations, entries: translations.entries.map(entry => entry.id === "text-0" ? { ...entry, text: "Different speech text" } : entry) })
  expect(timingStatus().current).toBe(false)
})

it("accepts a retained image-inventory translation without reading or replacing its physical asset", () => {
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Hello", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "1234567890abcdef", width: 10, height: 10 }, images: ["pg001_im001", "pg001_im001_tr_fr"].map(imageId => ({ imageId, buffer: Buffer.from(imageId), format: "png", hash: "1234567890abcdef", width: 10, height: 10 })) })
  const rendering = source()
  rendering.sections[0].html += '<img data-id="pg001_im001" />'
  storage.putNodeData("web-rendering", "pg001", rendering)
  fs.appendFileSync(path.join(storage.bookDir!, "config.yaml"), "image_translation:\n  enabled: true\n  selected_image_ids: [pg001_im001]\n")
  storage.putNodeData("image-captioning", "pg001", { captions: [{ imageId: "pg001_im001", caption: "Manual caption", reasoning: "", source: "manual" }] })
  const prior = storage.getImageMeta("pg001_im001_tr_fr")!
  const imageFile = path.join(storage.bookDir!, prior.relativePath)
  const bytes = fs.readFileSync(imageFile)
  const reads = vi.spyOn(fs, "readFileSync")
  acceptLegacyOutputBaseline(storage, read)
  expect(reads.mock.calls.some(([file]) => String(file) === imageFile)).toBe(false)
  reads.mockRestore()
  expect(storage.getImageMeta("pg001_im001_tr_fr")).toEqual(prior)
  expect(fs.readFileSync(imageFile)).toEqual(bytes)
  expect(read().find(output => output.identity.kind === "image-translation" && output.identity.id === "pg001_im001"))
    .toMatchObject({ current: true, protected: true, usable: true })
  expect(storage.getAllNodeVersions("image-translation", "pg001_im001_tr_fr")).toHaveLength(1)
  expect(read().find(output => output.identity.kind === "caption" && output.identity.id === "pg001_im001")).toMatchObject({ current: true, protected: true, manual: true })
})


it("accepts reactivated retained entries without replacing raw current copies or unknown metadata", () => {
  fs.appendFileSync(path.join(storage.bookDir!, "config.yaml"), "easy_read:\n  enabled: true\ncore_tts:\n  language_normalization: false\n")
  const retainedCore = { id: "text-0", displayText: "Hello 0", speechText: "Hello spoken", changed: true, transformations: [], status: "ready", generation: { mode: "manual", generatedAt: "old", enabledTransformations: [], sourceTextHash: "old", contextHash: "old" } }
  const untouched = { ...retainedCore, id: "text-1", speechText: "First retained phrasing", extraMetadata: { retained: true } }
  const conflict = { ...untouched, speechText: "Second retained phrasing" }
  storage.putNodeData("core-tts-catalog", "en", { language: "en", generatedAt: "old", entries: [retainedCore] })
  storage.putNodeData("core-tts-catalog", "en", { language: "en", generatedAt: "current", customMetadata: "keep", entries: [untouched, conflict] })
  storage.putNodeData("easy-read", "book", { generatedAt: "old", blocks: [{ pageId: "pg001", pageNumber: 1, sectionId: "owner", sectionIndex: 0, sectionType: "text", entries: [{ sourceId: "text-0", easyReadId: "text-0_easy_read", originalText: "Hello 0", text: "Simpler hello", pageId: "pg001", sectionId: "owner", sectionIndex: 0, source: "manual" }] }] })
  storage.putNodeData("easy-read", "book", { generatedAt: "current", customMetadata: "keep", blocks: [] })
  acceptLegacyOutputBaseline(storage, read)
  const core = storage.getLatestNodeData("core-tts-catalog", "en")!.data as { entries: Record<string, unknown>[]; customMetadata: string }
  expect(core.customMetadata).toBe("keep")
  expect(core.entries.slice(0, 2)).toEqual([untouched, conflict])
  expect(core.entries[2]).toMatchObject({ ...retainedCore, review: { action: "keep" } })
  expect(storage.getAllNodeVersions("core-tts-catalog", "en")).toHaveLength(3)
  const easy = storage.getLatestNodeData("easy-read", "book")!.data as { customMetadata: string }
  expect(easy.customMetadata).toBe("keep")
  expect(storage.getAllNodeVersions("easy-read", "book")).toHaveLength(3)
  const outputs = read()
  expect(outputs.find(output => output.identity.kind === "preparation" && output.identity.id === "text-0" && output.identity.language === "en"))
    .toMatchObject({ current: true, protected: true })
  expect(outputs.find(output => output.identity.kind === "preparation" && output.identity.id === "text-1" && output.identity.language === "en")?.current).toBe(false)
  expect(outputs.find(output => output.identity.kind === "easy-read" && output.identity.id === "text-0_easy_read"))
    .toMatchObject({ current: true, protected: true })
})


it.each(["damaged", [null]])("leaves malformed current collections intact while serving retained history (%j)", async entries => {
  const retained = { id: "text-0", displayText: "Hello 0", speechText: "Hello spoken", changed: true, transformations: [], status: "ready", generation: { mode: "manual", generatedAt: "old", enabledTransformations: [], sourceTextHash: "old", contextHash: "old" } }
  storage.putNodeData("core-tts-catalog", "en", { language: "en", generatedAt: "old", entries: [retained] })
  storage.putNodeData("core-tts-catalog", "en", { language: "en", generatedAt: "malformed", entries })
  const before = storage.getLatestNodeData("core-tts-catalog", "en")
  const app = createOutputRoutes(root, prompts)
  expect((await app.request(`/books/${label}/outputs/summary`)).status).toBe(200)
  expect(storage.getLatestNodeData("core-tts-catalog", "en")).toEqual(before)
  expect(read().find(output => output.identity.kind === "preparation" && output.identity.id === "text-0" && output.identity.language === "en"))
    .toMatchObject({ usable: true, current: false, protected: true })
})
