import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, publishSpeechOutput, storeImmutableAsset } from "@adt/storage"
import { loadBookConfig, readOutputCatalog, buildEasyReadSourceBlocks, outputEvidence, retainedEasyRead, flattenEasyReadEntries, reconcileSpeechInputs, loadCoreTtsProfiles } from "@adt/pipeline"
import { createTTSRoutes } from "./tts.js"
import { createEasyReadRoutes } from "./easy-read.js"
import type { TTSOutput } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
const label = "entrypoints"
const transport = vi.fn<typeof fetch>()
const storage = () => createBookStorage(label, root)
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-output-entrypoints-"))
  const db = storage()
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("text-catalog", "book", { entries: [{ id: "pg001_t001", text: "Hello", locations: [{ pageId: "pg001" }] }, { id: "pg001_t002", text: "Neighbor", locations: [{ pageId: "pg001" }] }], generatedAt: "before" })
  db.close()
  transport.mockReset()
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("AC-4/7 shared legacy correction survives an unrelated save and removal of its first consumer", async () => {
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [0, 1].map((i) => ({ sectionId: `section${i}`, sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] })) })
  db.putNodeData("web-rendering", "pg001", { sections: [0, 1].map((i) => ({ sectionId: `section${i}`, sectionIndex: i, sectionType: "text", reasoning: "", html: `<p data-id="shared">Shared phrase</p><p data-id="neighbor${i}">Context ${i}</p>` })) })
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en]\neasy_read:\n  enabled: true\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\n")
  const blocks = buildEasyReadSourceBlocks(db, db.getPages())
  for (const [i, block] of blocks.entries()) for (const entry of block.entries) {
    entry.text = entry.sourceId === "shared" ? i === 0 ? "Protected correction" : "Old generated copy" : `Easy ${entry.originalText}`
    entry.source = i === 0 && entry.sourceId === "shared" ? "manual" : "ai"
    entry.input = outputEvidence("old", entry.text)
  }
  db.putNodeData("easy-read", "book", { blocks, generatedAt: "before" })
  const raw = db.getLatestNodeData("easy-read", "book")
  expect(flattenEasyReadEntries(retainedEasyRead(db, [buildEasyReadSourceBlocks(db, db.getPages())[1]])).find((entry) => entry.id === "shared_easy_read")).toMatchObject({ text: "Protected correction", source: "manual" })
  const config = loadBookConfig(label, root)
  const reconciled = reconcileSpeechInputs({ storage: db, config, sourceLanguage: "en", languages: ["en"], profiles: loadCoreTtsProfiles(path.resolve("config")), promptsDir: path.resolve("prompts"), bookDir: db.bookDir! })
  expect(reconciled[0].entries.filter((entry) => entry.id === "shared_easy_read")).toHaveLength(1)
  const projection = readOutputCatalog({ storage: db, config, bookDir: db.bookDir!, promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  expect(projection.filter((entry) => entry.identity.kind === "easy-read" && entry.identity.id === "shared_easy_read")).toEqual([expect.objectContaining({ text: "Protected correction", protected: true, sectionIds: ["section0", "section1"] })])
  db.close()
  const app = createEasyReadRoutes(root, path.resolve("prompts"))
  const data = await (await app.request(`/books/${label}/easy-read`)).json()
  expect(data.blocks.map((block: { entries: Array<{ easyReadId: string; text: string }> }) => block.entries.find((entry) => entry.easyReadId === "shared_easy_read")!.text)).toEqual(["Protected correction", "Protected correction"])
  data.blocks[0].entries.find((entry: { easyReadId: string }) => entry.easyReadId === "neighbor0_easy_read").text = "Unrelated correction"
  const response = await app.request(`/books/${label}/easy-read`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, baseVersion: data.version }) })
  expect(response.status, await response.clone().text()).toBe(200)
  const reopened = storage()
  expect(reopened.getAllNodeVersions("easy-read", "book").find((row) => row.version === raw!.version)?.data).toEqual(raw!.data)
  const current = retainedEasyRead(reopened, [buildEasyReadSourceBlocks(reopened, reopened.getPages())[1]])
  expect(flattenEasyReadEntries(current).find((entry) => entry.id === "shared_easy_read")).toMatchObject({ text: "Protected correction", source: "manual" })
  reopened.close()
  expect(transport).not.toHaveBeenCalled()
})

it("AC-5/8/9 single-item Gemini uses page context, becomes current, preserves its neighbor and skips the next request", async () => {
  const db = storage()
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\nspeech:\n  default_provider: gemini\n  batch_by_page: true\n  word_highlighting: false\n")
  const asset = storeImmutableAsset(db.bookDir!, ["audio", "en"], "neighbor", "wav", Buffer.from("manual recording"))
  const neighbor = { textId: "pg001_t002", language: "en", fileName: asset.fileName, audioHash: asset.contentHash, provider: "manual", source: "manual" as const, model: "manual", voice: "manual", cached: false }
  publishSpeechOutput(db, "en", { entries: [neighbor], generatedAt: "before" })
  db.close()
  transport.mockImplementation(async (url, request) => {
    if (String(url).includes(":generateContent")) {
      expect(String(request?.body)).toContain("Hello")
      expect(String(request?.body)).toContain("Neighbor")
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.alloc(96000).toString("base64") } }] } }] })
    }
    if (String(url).includes("/audio/transcriptions")) return Response.json({ text: "Hello Neighbor", duration: 2, words: [{ word: "Hello", start: 0, end: 0.5 }, { word: "Neighbor", start: 1, end: 1.5 }] })
    throw new Error(`Unexpected transport: ${url}`)
  })
  const app = createTTSRoutes(root)
  const generate = () => app.request(`/books/${label}/tts/generate-one`, { method: "POST", headers: { "Content-Type": "application/json", "X-Gemini-API-Key": "stub", "X-OpenAI-Key": "stub" }, body: JSON.stringify({ textId: "pg001_t001", language: "en", voiceSlot: "primary" }) })
  const response = await generate()
  expect(response.status, await response.clone().text()).toBe(200)
  const reopened = storage()
  const outputs = readOutputCatalog({ storage: reopened, config: loadBookConfig(label, root), bookDir: reopened.bookDir!, promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  expect(outputs.find((item) => item.identity.kind === "audio" && item.identity.id === "pg001_t001")).toMatchObject({ current: true, usable: true, updateNeeded: false })
  expect((reopened.getLatestNodeData("tts", "en")!.data as TTSOutput).entries.find((entry) => entry.textId === neighbor.textId)).toMatchObject(neighbor)
  expect(fs.readFileSync(path.join(reopened.bookDir!, "audio/en", neighbor.fileName), "utf8")).toBe("manual recording")
  reopened.close()
  expect(transport).toHaveBeenCalledTimes(2)
  expect((await generate()).status).toBe(200)
  expect(transport).toHaveBeenCalledTimes(2)
})

it.each(["abort", "prompt", "model"])("AC-9/16 direct Easy Read rejects obsolete publication after %s changes at the transport boundary", async (change) => {
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "section0", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  db.putNodeData("web-rendering", "pg001", { sections: [{ sectionId: "section0", sectionIndex: 0, sectionType: "text", reasoning: "", html: '<p data-id="shared">Shared phrase</p>' }] })
  const configPath = path.join(db.bookDir!, "config.yaml")
  fs.writeFileSync(configPath, "editing_language: en\noutput_languages: [en]\neasy_read:\n  enabled: true\n  model: ollama:tinyllama\n")
  const prompts = path.join(root, "prompts")
  fs.mkdirSync(prompts)
  const prompt = path.join(prompts, "easy_read.liquid")
  fs.writeFileSync(prompt, '{% chat role: "user" %}{{ section_text }}{% for t in texts %}{{ t.text }}{% endfor %}{% endchat %}')
  db.close()
  const controller = new AbortController()
  transport.mockImplementation(async () => {
    if (change === "abort") controller.abort()
    if (change === "prompt") fs.appendFileSync(prompt, " changed")
    if (change === "model") fs.writeFileSync(configPath, "easy_read:\n  enabled: true\n  model: ollama:other-model\n")
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ texts: ["Obsolete result"] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  const app = createEasyReadRoutes(root, prompts)
  app.onError(errorHandler)
  const response = await app.request(`/books/${label}/easy-read/regenerate`, { method: "POST", signal: controller.signal })
  if (change === "abort") expect(response.ok).toBe(false)
  else expect(response.status).toBe(409)
  const reopened = storage()
  expect(reopened.getLatestNodeData("easy-read", "book")).toBeNull()
  reopened.close()
  expect(transport).toHaveBeenCalledTimes(1)
})
