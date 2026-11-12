import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { loadBookConfig, loadCoreTtsProfiles, reconcileSpeechInputs } from "@adt/pipeline"
import type { CoreTtsCatalogOutput, OutputRunScope, TTSOutput, WordTimestampOutput } from "@adt/types"
import { catalogOutputs } from "./catalog-output-service.js"
import { acceptLegacyOutputBaseline } from "./legacy-output-baseline.js"
import { createStageRunner } from "./stage-runner.js"

let root: string
const label = "review-chain"
const promptsDir = path.resolve("prompts")
const transport = vi.fn<typeof fetch>()
const storage = () => createBookStorage(label, root)
const source = (text: string) => ({ sections: [{ sectionIndex: 0, sectionId: "owner", sectionType: "text", reasoning: "",
  html: `<section data-section-id="owner"><p data-id="phrase">${text}</p><p data-id="neighbor">Untouched neighbor</p></section>` }] })
function outputs() {
  const db = storage()
  try { return catalogOutputs(db, label, root, promptsDir) } finally { db.close() }
}
function scope(): OutputRunScope {
  const targets = outputs().filter(o => o.identity.id === "phrase" && ["audio", "preparation"].includes(o.identity.kind))
  return { selection: { identities: targets.map(o => o.identity) }, replace: targets.map(({ identity, signature, contentHash }) => ({ identity, signature, contentHash })) }
}
const run = (outputScope: OutputRunScope, signal?: AbortSignal) => createStageRunner().run(label, {
  booksDir: root, promptsDir, fromStage: "translate", toStage: "speech", credentials: { openai: { apiKey: "fixture" } }, outputScope, signal,
}, { emit: () => {} })

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-review-chain-"))
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Water erosion", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 10, height: 10 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "owner", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  db.putNodeData("web-rendering", "pg001", source("Water erosion"))
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\nspeech:\n  default_provider: openai\n  word_highlighting: false\n")
  reconcileSpeechInputs({ storage: db, config: loadBookConfig(label, root), sourceLanguage: "en", languages: ["en"], profiles: loadCoreTtsProfiles(path.resolve("config")), promptsDir, bookDir: db.bookDir! })
  const prepared = db.getLatestNodeData("core-tts-catalog", "en")!.data as CoreTtsCatalogOutput
  db.putNodeData("core-tts-catalog", "en", { ...prepared, entries: prepared.entries.map(({ source: _source, input: _input, ...entry }) => entry) })
  fs.mkdirSync(path.join(db.bookDir!, "audio/en"), { recursive: true })
  for (const id of ["phrase", "neighbor"]) fs.writeFileSync(path.join(db.bookDir!, `audio/en/${id}.mp3`), `old ${id}`)
  db.putNodeData("tts", "en", { entries: ["phrase", "neighbor"].map(textId => ({ textId, language: "en", fileName: `${textId}.mp3`, provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy", cached: false })), generatedAt: "before" })
  acceptLegacyOutputBaseline(db, () => catalogOutputs(db, label, root, promptsDir))
  db.putNodeData("web-rendering", "pg001", source("Earth erosion"))
  db.close()
  transport.mockReset().mockImplementation(async (url) => {
    if (String(url).includes("/audio/speech")) return new Response(Buffer.from("new recording"), { headers: { "Content-Type": "audio/mpeg" } })
    throw new Error(`Unexpected provider call: ${url}`)
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("replaces legacy speech text and audio in one review, preserving unrelated output and history", async () => {
  const selected = scope()
  expect(selected.replace).toHaveLength(2)
  expect(outputs().filter(o => o.identity.id === "phrase").every(o => o.protected && !o.current)).toBe(true)
  await run(selected)
  expect(outputs().filter(o => o.identity.id === "phrase")).toEqual(expect.arrayContaining([
    expect.objectContaining({ identity: expect.objectContaining({ kind: "preparation" }), text: "Earth erosion", current: true, protected: false, warnings: [] }),
    expect.objectContaining({ identity: expect.objectContaining({ kind: "audio" }), current: true, protected: false, warnings: [] }),
  ]))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).input).toBe("Earth erosion")
  const db = storage()
  try {
    expect((db.getAllNodeVersions("tts", "en").find(row => row.version === 1)!.data as TTSOutput).entries[0].fileName).toBe("phrase.mp3")
    expect(fs.readFileSync(path.join(db.bookDir!, "audio/en/phrase.mp3"), "utf8")).toBe("old phrase")
    const neighbor = (db.getLatestNodeData("tts", "en")!.data as TTSOutput).entries.find(e => e.textId === "neighbor")!
    expect(neighbor.source).toBeUndefined()
    expect(fs.readFileSync(path.join(db.bookDir!, "audio/en", neighbor.fileName), "utf8")).toBe("old neighbor")
  } finally { db.close() }
})

it("rejects stale consent before publishing any part of the chain", async () => {
  const selected = scope()
  const db = storage()
  db.putNodeData("web-rendering", "pg001", source("A newer edit"))
  const before = db.getNodeVersionFingerprint()
  db.close()
  await expect(run(selected)).rejects.toThrow("Output changed since review")
  expect(transport).not.toHaveBeenCalled()
  const after = storage()
  try { expect(after.getNodeVersionFingerprint()).toEqual(before) } finally { after.close() }
})

it("replaces the audio and timing pair, retains manual timing history and reuses the completed selection", async () => {
  const configFile = path.join(root, label, "config.yaml")
  fs.writeFileSync(configFile, fs.readFileSync(configFile, "utf8").replace("word_highlighting: false", "word_highlighting: true"))
  const db = storage()
  db.putNodeData("tts-timestamps", "en", { entries: { phrase: { textId: "phrase", language: "en", voiceSlot: "primary",
    words: [{ word: "Water erosion", start: 0.1, end: 0.9 }], duration: 1, source: "manual" } }, generatedAt: "before" })
  const before = db.getLatestNodeData("tts-timestamps", "en")!
  db.close()
  const targets = outputs().filter(output => output.identity.id === "phrase")
  expect(targets.map(output => output.identity.kind).sort()).toEqual(["audio", "preparation", "timestamps"])
  const selection = { identities: targets.map(output => output.identity) }
  transport.mockImplementation(async url => String(url).includes("/audio/transcriptions")
    ? Response.json({ text: "Earth erosion", duration: 1, words: [{ word: "Earth", start: 0, end: 0.4 }, { word: "erosion", start: 0.4, end: 1 }] })
    : new Response(Buffer.from("new recording")))
  await run({ selection, replace: targets.map(({ identity, signature, contentHash }) => ({ identity, signature, contentHash })) })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(outputs().filter(output => output.identity.id === "phrase").every(output => output.current && !output.warnings.length)).toBe(true)
  const verify = storage()
  try {
    const audio = (verify.getLatestNodeData("tts", "en")!.data as TTSOutput).entries.find(entry => entry.textId === "phrase")!
    const timing = (verify.getLatestNodeData("tts-timestamps", "en")!.data as WordTimestampOutput).entries.phrase
    expect(timing.audioHash).toBe(audio.audioHash)
    expect(timing.source).toBe("ai")
    expect(verify.getAllNodeVersions("tts-timestamps", "en")).toContainEqual(before)
  } finally { verify.close() }
  await run({ selection })
  expect(transport).toHaveBeenCalledTimes(2)
})

it("skips unrelated source generators inside an exact review range", async () => {
  const completed: string[] = []
  await createStageRunner().run(label, {
    booksDir: root, promptsDir, fromStage: "captions", toStage: "speech", credentials: { openai: { apiKey: "fixture" } }, outputScope: scope(),
  }, { emit: event => { if (event.type === "stage-complete") completed.push(event.stage) } })
  expect(completed).toEqual(["translate", "speech"])
  expect(transport).toHaveBeenCalledTimes(1)
})

it("does not accept changed downstream settings as part of its own source update", async () => {
  await expect(createStageRunner().run(label, {
    booksDir: root, promptsDir, fromStage: "translate", toStage: "speech", credentials: { openai: { apiKey: "fixture" } }, outputScope: scope(),
  }, { emit: event => {
    if (event.type === "step-start" && event.step === "core-tts-catalog") {
      fs.appendFileSync(path.join(root, label, "config.yaml"), "  model: tts-1\n")
    }
  } })).rejects.toThrow("Output or its inputs changed")
  expect(transport).not.toHaveBeenCalled()
  const db = storage()
  try { expect((db.getLatestNodeData("core-tts-catalog", "en")!.data as CoreTtsCatalogOutput).entries.find(entry => entry.id === "phrase")!.speechText).toBe("Water erosion") }
  finally { db.close() }
})

it("honors a skipped recording while reviewing its source", async () => {
  const selected = scope()
  selected.skip = selected.selection!.identities!.filter(identity => identity.kind === "audio")
  await run(selected)
  expect(transport).not.toHaveBeenCalled()
  expect(outputs().find(output => output.identity.kind === "preparation" && output.identity.id === "phrase")!.text).toBe("Earth erosion")
  const db = storage()
  try {
    const retained = (db.getLatestNodeData("tts", "en")!.data as TTSOutput).entries.find(entry => entry.textId === "phrase")!
    expect(fs.readFileSync(path.join(db.bookDir!, "audio/en", retained.fileName), "utf8")).toBe("old phrase")
    expect(retained.source).toBeUndefined()
  }
  finally { db.close() }
})

it.each(["cancel", "source edit"])("preserves the recording if %s happens during synthesis", async change => {
  const controller = new AbortController()
  transport.mockImplementation(async () => {
    if (change === "cancel") controller.abort()
    else { const db = storage(); db.putNodeData("web-rendering", "pg001", source("Changed during synthesis")); db.close() }
    return new Response(Buffer.from("obsolete recording"))
  })
  await expect(run(scope(), controller.signal)).rejects.toThrow()
  const db = storage()
  try { expect((db.getLatestNodeData("tts", "en")!.data as TTSOutput).entries.find(e => e.textId === "phrase")!.fileName).toBe("phrase.mp3") } finally { db.close() }
})
