import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, publishSpeechOutput, storeImmutableAsset } from "@adt/storage"
import { loadBookConfig, readOutputCatalog } from "@adt/pipeline"
import type { OutputRunScope, TTSOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"

let root: string
const label = "page-batch"
const transport = vi.fn<typeof fetch>()
const promptsDir = path.resolve("prompts")
const storage = () => createBookStorage(label, root)
const audio = () => { const db = storage(); try { return db.getLatestNodeData("tts", "en")! as { version: number; data: TTSOutput } } finally { db.close() } }
function statuses() {
  const db = storage()
  try { return readOutputCatalog({ storage: db, config: loadBookConfig(label, root), bookDir: db.bookDir!, promptsDir, configDir: path.resolve("config") }) }
  finally { db.close() }
}
function run(outputScope: OutputRunScope, signal?: AbortSignal) {
  return createStageRunner().run(label, { booksDir: root, promptsDir, fromStage: "speech", toStage: "speech", outputScope, signal,
    credentials: { openai: { apiKey: "alignment-fixture" }, gemini: { apiKey: "synthesis-fixture" } } }, { emit: () => {} })
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-scoped-page-audio-"))
  const db = storage()
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("text-catalog", "book", { entries: [
    { id: "pg002_t001", text: "Hello", locations: [{ pageId: "pg001", sectionId: "selected" }] },
    { id: "pg001_t002", text: "Neighbor", locations: [{ pageId: "pg001", sectionId: "other" }] },
  ], generatedAt: "before" })
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\nspeech:\n  default_provider: gemini\n  batch_by_page: true\n  word_highlighting: false\n")
  const asset = storeImmutableAsset(db.bookDir!, ["audio", "en"], "pg001_t002", "wav", Buffer.from("manual neighbor recording"))
  publishSpeechOutput(db, "en", { entries: [{ textId: "pg001_t002", language: "en", fileName: asset.fileName, audioHash: asset.contentHash, source: "manual", provider: "manual", voice: "manual", model: "manual", cached: false }], generatedAt: "before" })
  db.close()
  transport.mockReset().mockImplementation(async (url) => {
    if (String(url).includes(":generateContent")) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.alloc(96000).toString("base64") } }] } }] })
    if (String(url).includes("/audio/transcriptions")) return Response.json({ text: "Hello Neighbor", duration: 2, words: [{ word: "Hello", start: 0, end: 0.8 }, { word: "Neighbor", start: 1, end: 1.8 }] })
    throw new Error(`Unexpected provider URL: ${url}`)
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("uses current page membership for a moved stable ID and preserves neighboring manual bytes and references across scoped generation and a cache hit", async () => {
  const neighbor = audio().data.entries[0]
  await run({ selection: { sectionIds: ["selected"] } })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).contents[0].parts[0].text).toContain("Hello\n\nNeighbor")
  const generated = audio()
  expect(generated.data.entries.find((entry) => entry.textId === neighbor.textId)).toMatchObject(neighbor)
  const status = statuses().find((output) => output.identity.kind === "audio" && output.identity.id === "pg002_t001")!
  await run({ selection: { sectionIds: ["selected"] }, replace: [{ identity: status.identity, signature: status.signature, contentHash: status.contentHash }] })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(audio().data.entries.find((entry) => entry.textId === neighbor.textId)).toMatchObject(neighbor)
  expect(fs.readFileSync(path.join(root, label, "audio", "en", neighbor.fileName), "utf8")).toBe("manual neighbor recording")
  expect(audio().data.entries.find((entry) => entry.textId === "pg002_t001")!.fileName).toBe(generated.data.entries.find((entry) => entry.textId === "pg002_t001")!.fileName)
})

it("cancellation after page synthesis cannot publish slices or replace a neighbor", async () => {
  const previous = audio()
  const controller = new AbortController()
  const respond = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => { const response = await respond(...args); if (String(args[0]).includes(":generateContent")) controller.abort(); return response })
  await run({ selection: { sectionIds: ["selected"] } }, controller.signal).catch(() => {})
  expect(transport.mock.calls.filter(([url]) => String(url).includes(":generateContent"))).toHaveLength(1)
  expect(audio()).toEqual(previous)
  expect(fs.readFileSync(path.join(root, label, "audio", "en", previous.data.entries[0].fileName), "utf8")).toBe("manual neighbor recording")
})
