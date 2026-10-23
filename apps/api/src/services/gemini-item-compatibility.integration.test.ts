import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { loadBookConfig, readOutputCatalog } from "@adt/pipeline"
import type { TTSOutput } from "@adt/types"
import { createTTSRoutes } from "../routes/tts.js"
import { createStageRunner } from "./stage-runner.js"

let root: string
const label = "gemini-item"
const transport = vi.fn<typeof fetch>()
const promptsDir = path.resolve("prompts")
const storage = () => createBookStorage(label, root)
const configPath = () => path.join(root, "global.yaml")
function configure(extra = "") {
  fs.writeFileSync(configPath(), `structure_types: {}\nrole_types: {}\nediting_language: en\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\nspeech:\n  default_provider: gemini\n  batch_by_page: true\n  word_highlighting: false\n${extra}`)
}
function source(first = "Hello", neighbor = "Neighbor") {
  const db = storage()
  try { db.putNodeData("text-catalog", "book", { entries: [{ id: "pg001_t001", text: first }, { id: "pg001_t002", text: neighbor }], generatedAt: "fixture" }) }
  finally { db.close() }
}
function audio() {
  const db = storage()
  try { return db.getLatestNodeData("tts", "en") as { version: number; data: TTSOutput } | null }
  finally { db.close() }
}
function statuses() {
  const db = storage()
  try { return readOutputCatalog({ storage: db, config: loadBookConfig(label, root, configPath()), bookDir: db.bookDir!, promptsDir, configDir: path.join(root, "config") }) }
  finally { db.close() }
}
function generate(options: { voiceSlot?: "primary" | "secondary"; alignment?: boolean; signal?: AbortSignal; replace?: boolean } = {}) {
  const status = statuses().find((item) => item.identity.kind === "audio" && item.identity.id === "pg001_t001" && item.identity.voiceSlot === (options.voiceSlot ?? "primary"))!
  return createTTSRoutes(root, configPath(), undefined, promptsDir).request(`/books/${label}/tts/generate-one`, {
    method: "POST", signal: options.signal,
    headers: { "Content-Type": "application/json", "X-Gemini-API-Key": "fixture", ...(options.alignment ? { "X-OpenAI-Key": "fixture" } : {}) },
    body: JSON.stringify({ textId: "pg001_t001", language: "en", voiceSlot: options.voiceSlot,
      ...(options.replace ? { replace: { signature: status.signature, contentHash: status.contentHash } } : {}) }),
  })
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-gemini-item-compat-"))
  configure()
  const db = storage()
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.close()
  source()
  transport.mockReset().mockImplementation(async (url) => {
    if (String(url).includes(":generateContent")) return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.alloc(96000).toString("base64") } }] } }] })
    if (String(url).includes("/audio/transcriptions")) return Response.json({ text: "Hello Neighbor", duration: 2, words: [{ word: "Hello", start: 0, end: 0.8 }, { word: "Neighbor", start: 1, end: 1.8 }] })
    throw new Error(`Unexpected provider URL: ${url}`)
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("publishes truthful item evidence, remains current across neighbor changes, and reuses through the item route and ordinary stage without alignment", async () => {
  const response = await generate()
  expect(response.status, await response.clone().text()).toBe(200)
  expect(transport).toHaveBeenCalledTimes(1)
  const entry = audio()!.data.entries[0]
  expect(entry.pageBatchFallback).toBe("single-item")
  const item = () => statuses().find((item) => item.identity.kind === "audio" && item.identity.id === entry.textId)!
  expect(item()).toMatchObject({ current: true, updateNeeded: false, signature: entry.speechInputSignature })
  source("Hello", "Changed neighbor")
  expect(item().current).toBe(true)
  expect((await generate()).status).toBe(200)
  expect((await generate({ alignment: true })).status).toBe(200)
  await createStageRunner().run(label, { booksDir: root, promptsDir, configPath: configPath(), fromStage: "speech", toStage: "speech",
    outputScope: { selection: { ids: [entry.textId] } }, credentials: { gemini: { apiKey: "fixture" } } }, { emit: () => {} })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(audio()!.data.entries[0]).toMatchObject(entry)
  // An ordinary whole-stage run also skips this current artifact. The other
  // phrase is explicitly muted, so no missing page work needs alignment.
  configure("  excluded_text_ids: [pg001_t002]\n")
  await createStageRunner().run(label, { booksDir: root, promptsDir, configPath: configPath(), fromStage: "speech", toStage: "speech",
    credentials: { gemini: { apiKey: "fixture" } } }, { emit: () => {} })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(audio()!.data.entries[0]).toMatchObject(entry)
  source("Changed own text", "Changed neighbor")
  expect(item().updateNeeded).toBe(true)
})

it("retains actual page context when alignment is available", async () => {
  expect((await generate({ alignment: true })).status).toBe(200)
  expect(transport).toHaveBeenCalledTimes(2)
  expect(audio()!.data.entries[0].pageBatchFallback).toBeUndefined()
  expect(statuses().find((item) => item.identity.kind === "audio" && item.identity.id === "pg001_t001")!.current).toBe(true)
  source("Hello", "Changed neighbor")
  expect(statuses().find((item) => item.identity.kind === "audio" && item.identity.id === "pg001_t001")!.updateNeeded).toBe(true)
})

it("requires alignment for a new page-batched item with highlighting enabled", async () => {
  fs.writeFileSync(configPath(), fs.readFileSync(configPath(), "utf8").replace("word_highlighting: false", "word_highlighting: true"))
  const response = await generate()
  expect(response.status).toBe(400)
  expect(transport).not.toHaveBeenCalled()
  expect(audio()).toBeNull()
})

it("keeps secondary voice identity and invalidates changed synthesis settings", async () => {
  configure("  secondary_voices:\n    en:\n      provider: gemini\n      model: gemini-2.5-flash-preview-tts\n      voice: Puck\n")
  expect((await generate({ voiceSlot: "secondary" })).status).toBe(200)
  expect(audio()!.data.entries[0]).toMatchObject({ voiceSlot: "secondary", voice: "Puck", pageBatchFallback: "single-item" })
  configure("  secondary_voices:\n    en:\n      provider: gemini\n      model: gemini-2.5-flash-preview-tts\n      voice: Kore\n")
  expect(statuses().find((item) => item.identity.kind === "audio" && item.identity.voiceSlot === "secondary" && item.identity.id === "pg001_t001")!.updateNeeded).toBe(true)
})

it.each(["cancel", "conflict"])("preserves the prior manifest, history and bytes after %s following synthesis", async (failure) => {
  expect((await generate()).status).toBe(200)
  const previous = audio()!
  const asset = path.join(root, label, "audio", "en", previous.data.entries[0].fileName)
  const bytes = fs.readFileSync(asset)
  source("A new phrase")
  const controller = new AbortController()
  const respond = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => {
    const response = await respond(...args)
    if (failure === "cancel") controller.abort()
    else source("Concurrent phrase")
    return response
  })
  const response = await generate({ signal: controller.signal })
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(audio()).toEqual(previous)
  expect(fs.readFileSync(asset)).toEqual(bytes)
  const db = storage()
  try { expect(db.getAllNodeVersions("tts", "en")).toHaveLength(previous.version) }
  finally { db.close() }
})

it.each(["model", "instructions"])("marks an item stale when its actual %s changes", async (setting) => {
  expect((await generate()).status).toBe(200)
  if (setting === "model") configure("  providers:\n    gemini:\n      model: gemini-2.5-pro-preview-tts\n")
  else { fs.mkdirSync(path.join(root, "config")); fs.writeFileSync(path.join(root, "config", "speech_instructions.yaml"), "default: Speak gently\n") }
  expect(statuses().find((item) => item.identity.kind === "audio" && item.identity.id === "pg001_t001")!.updateNeeded).toBe(true)
})


it("whole Speech records item fallback without alignment and skips it on an ordinary rerun", async () => {
  const run = () => createStageRunner().run(label, { booksDir: root, promptsDir, configPath: configPath(), fromStage: "speech", toStage: "speech",
    credentials: { gemini: { apiKey: "fixture" } } }, { emit: () => {} })
  await run()
  expect(transport).toHaveBeenCalledTimes(2)
  const before = audio()!
  expect(before.data.entries).toHaveLength(2)
  for (const entry of before.data.entries) {
    expect(entry.pageBatchFallback).toBe("single-item")
    expect(statuses().find(item => item.identity.kind === "audio" && item.identity.id === entry.textId)).toMatchObject({current: true, updateNeeded: false, signature: entry.speechInputSignature})
  }
  await run()
  expect(transport).toHaveBeenCalledTimes(2)
  expect(audio()!.data.entries).toEqual(before.data.entries)
})

it.each(["stage", "retry"])("%s recovers an unavailable legacy recording and preserves manual and usable unknown recordings", async pathKind => {
  source("Hello", "Neighbor")
  const db = storage()
  const entries = [
    {textId: "pg001_t001", language: "en", fileName: "missing.wav", provider: "gemini", voice: "Kore", model: "old-model", cached: false},
    {textId: "pg001_t002", language: "en", fileName: "existing.wav", provider: "gemini", voice: "Kore", model: "old-model", cached: false},
    {textId: "pg001_t003", language: "en", fileName: "manual-missing.wav", provider: "manual", voice: "manual", model: "manual", cached: false},
  ]
  db.putNodeData("text-catalog", "book", {entries: [{id: "pg001_t001", text: "Hello"}, {id: "pg001_t002", text: "Neighbor"}, {id: "pg001_t003", text: "Manual"}], generatedAt: "fixture"})
  db.putNodeData("tts", "en", {entries, generatedAt: "legacy"})
  fs.mkdirSync(path.join(db.bookDir!, "audio", "en"), {recursive: true})
  fs.writeFileSync(path.join(db.bookDir!, "audio", "en", "existing.wav"), "Retained legacy bytes")
  db.close()
  const missing = statuses().find(item => item.identity.kind === "audio" && item.identity.id === "pg001_t001")!
  expect(missing).toMatchObject({missing: true, protected: false})
  if (pathKind === "retry") expect((await generate()).status).toBe(200)
  else await createStageRunner().run(label, {booksDir: root, promptsDir, configPath: configPath(), fromStage: "speech", toStage: "speech", credentials: {gemini: {apiKey: "fixture"}}}, {emit: () => {}})
  expect(transport).toHaveBeenCalledTimes(1)
  const saved = audio()!.data.entries
  expect(saved.find(entry => entry.textId === "pg001_t001")!.fileName).not.toBe("missing.wav")
  const retained = saved.find(entry => entry.textId === "pg001_t002")!
  const { fileName: _legacyName, ...metadata } = entries[1]
  expect(retained).toMatchObject(metadata)
  expect(retained.source).toBeUndefined()
  expect(fs.readFileSync(path.join(root, label, "audio", "en", retained.fileName), "utf8")).toBe("Retained legacy bytes")
  expect(saved.find(entry => entry.textId === "pg001_t003")).toMatchObject(entries[2])
  expect(statuses().find(item => item.identity.kind === "audio" && item.identity.id === "pg001_t001")).toMatchObject({current: true, missing: false})
  expect(statuses().find(item => item.identity.kind === "audio" && item.identity.id === "pg001_t003")).toMatchObject({missing: true, protected: true})
  const reopened = storage()
  try {
    const history = reopened.getAllNodeVersions("tts", "en")
    expect(history.length).toBeGreaterThan(1)
    expect(history.find(row => row.version === 1)?.data).toEqual({entries, generatedAt: "legacy"})
    expect(fs.readFileSync(path.join(reopened.bookDir!, "audio", "en", "existing.wav"), "utf8")).toBe("Retained legacy bytes")
  } finally { reopened.close() }
})
