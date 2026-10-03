import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { TaskExecutor, TaskService } from "../services/task-service.js"

const { transcribe } = vi.hoisted(() => ({ transcribe: vi.fn() }))
vi.mock("@adt/pipeline", async () => ({
  ...await vi.importActual<typeof import("@adt/pipeline")>("@adt/pipeline"),
  generateWordTimestamps: transcribe,
}))
import { createTTSRoutes } from "./tts.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"

let root: string
let books: string
let book: string
let outside: string
let config: string
let assets: string
const label = "security-book"
const textId = "pg001_t001"
const fileName = `${textId}.wav`

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-media-security-"))
  books = path.join(root, "books")
  book = path.join(books, label)
  outside = path.join(root, "outside")
  assets = path.join(root, "assets")
  fs.mkdirSync(outside, { recursive: true })
  fs.mkdirSync(assets)
  config = path.join(root, "config.yaml")
  fs.writeFileSync(config, "role_types:\n  section_text: Main body text\nstructure_types:\n  paragraph: Paragraph\nspeech:\n  default_provider: gemini\n  providers:\n    gemini:\n      languages:\n        - en\n")
  const storage = createBookStorage(label, books)
  try {
    storage.putNodeData("metadata", "book", { title: "Security test", language_code: "en", reasoning: "test" })
    storage.putNodeData("text-catalog", "book", { entries: [{ id: textId, text: "Hello" }], generatedAt: new Date().toISOString() })
    storage.putNodeData("core-tts-catalog", "en", {
      language: "en", generatedAt: new Date().toISOString(),
      entries: [{ id: textId, displayText: "Hello", speechText: "Hello", changed: false, transformations: [], status: "ready", generation: { mode: "unchanged", generatedAt: new Date().toISOString(), enabledTransformations: [], sourceTextHash: "source", contextHash: "context" } }],
    })
    storage.putNodeData("tts", "en", { entries: [{ textId, language: "en", fileName, voice: "uploaded", model: "uploaded", cached: false, provider: "manual" }], generatedAt: new Date().toISOString() })
  } finally {
    storage.close()
  }
  transcribe.mockReset().mockResolvedValue({ words: [{ word: "Hello", start: 0, end: 1 }], duration: 1 })
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

function upload() {
  const form = new FormData()
  form.append("textId", textId)
  form.append("language", "en")
  form.append("audio", new File(["UPLOAD CANARY"], "sample.wav", { type: "audio/wav" }))
  return createTTSRoutes(books, config).request(`/books/${label}/tts/upload-one`, { method: "POST", body: form })
}

function requestTranscription(batch = false, tasks?: TaskService) {
  return createTTSRoutes(books, config, tasks).request(`/books/${label}/tts/transcribe-${batch ? "all" : "one"}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "test-not-a-real-key" },
    body: JSON.stringify(batch ? { language: "en" } : { textId, language: "en" }),
  })
}

function readTts() {
  const storage = createBookStorage(label, books)
  try { return storage.getLatestNodeData("tts", "en") } finally { storage.close() }
}

it.each([false, true])("rejects outside upload links (destination exists: %s) without changing audio or manifest", async (exists) => {
  const audioDir = path.join(book, "audio", "en")
  fs.mkdirSync(audioDir, { recursive: true })
  const target = path.join(outside, "target")
  if (exists) fs.writeFileSync(target, "PRESERVE")
  fs.symlinkSync(target, path.join(audioDir, fileName))
  const before = readTts()
  expect((await upload()).status).toBe(400)
  expect(fs.existsSync(target)).toBe(exists)
  if (exists) expect(fs.readFileSync(target, "utf8")).toBe("PRESERVE")
  expect(readTts()).toEqual(before)
})

it.each(["audio", "language"])("rejects linked %s directories for upload, serving, and both transcribers", async (level) => {
  const link = level === "audio" ? path.join(book, "audio") : path.join(book, "audio", "en")
  const destination = level === "audio" ? path.join(outside, "en") : outside
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, fileName), "OUTSIDE CANARY")
  fs.symlinkSync(outside, link, "junction")
  const before = readTts()
  expect((await upload()).status).toBe(400)
  expect((await createTTSRoutes(books, config).request(`/books/${label}/audio/en/${fileName}`)).status).toBe(400)
  expect((await createAdtPreviewRoutes(books, assets, config).request(`/books/${label}/adt-preview/content/i18n/en/audio/${fileName}`)).status).toBe(400)
  expect((await requestTranscription()).status).toBe(400)
  const submitTask = vi.fn()
  expect((await requestTranscription(true, { submitTask, getActiveTasks: () => [] })).status).toBe(400)
  expect(submitTask).not.toHaveBeenCalled()
  expect(transcribe).not.toHaveBeenCalled()
  expect(fs.readFileSync(path.join(destination, fileName), "utf8")).toBe("OUTSIDE CANARY")
  expect(readTts()).toEqual(before)
})

it("rejects a linked book directory before opening storage", async () => {
  const externalBook = path.join(outside, label)
  fs.renameSync(book, externalBook)
  fs.symlinkSync(externalBook, book, "junction")
  const dbPath = path.join(externalBook, `${label}.db`)
  const before = fs.readFileSync(dbPath)
  expect((await upload()).status).toBe(400)
  expect((await requestTranscription()).status).toBe(400)
  expect((await requestTranscription(true)).status).toBe(400)
  expect((await createTTSRoutes(books, config).request(`/books/${label}/audio/en/${fileName}`)).status).toBe(400)
  expect((await createAdtPreviewRoutes(books, assets, config).request(`/books/${label}/adt-preview/images/file.png`)).status).toBe(403)
  expect(fs.readFileSync(dbPath)).toEqual(before)
  expect(transcribe).not.toHaveBeenCalled()
})

it("rejects linked image roots and outside asset files", async () => {
  fs.writeFileSync(path.join(outside, "canary.png"), "OUTSIDE IMAGE")
  fs.rmSync(path.join(book, "images"), { recursive: true, force: true })
  fs.symlinkSync(outside, path.join(book, "images"), "junction")
  fs.symlinkSync(path.join(outside, "canary.png"), path.join(assets, "canary.png"))
  const app = createAdtPreviewRoutes(books, assets, config)
  expect((await app.request(`/books/${label}/adt-preview/images/canary.png`)).status).toBe(403)
  expect((await app.request(`/books/${label}/adt-preview/assets/canary.png`)).status).toBe(403)
})

it("rechecks containment when the batch executor runs", async () => {
  const audioDir = path.join(book, "audio", "en")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(path.join(audioDir, fileName), "VALID AUDIO")
  fs.writeFileSync(path.join(outside, fileName), "OUTSIDE CANARY")
  let executor: TaskExecutor | undefined
  const tasks: TaskService = {
    submitTask: (_label, _kind, _description, run) => { executor = run; return { taskId: "test-task" } },
    getActiveTasks: () => [],
  }
  expect((await requestTranscription(true, tasks)).status).toBe(200)
  fs.renameSync(audioDir, `${audioDir}-original`)
  fs.symlinkSync(outside, audioDir, "junction")
  expect(executor).toBeDefined()
  expect(await executor!(() => {})).toMatchObject({ count: 0, failed: 1 })
  expect(transcribe).not.toHaveBeenCalled()
})

it.each([false, true])("rejects an outside audio file link in transcription (batch: %s)", async (batch) => {
  const audioDir = path.join(book, "audio", "en")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(path.join(outside, fileName), "OUTSIDE CANARY")
  fs.symlinkSync(path.join(outside, fileName), path.join(audioDir, fileName))
  let executor: TaskExecutor | undefined
  const response = await requestTranscription(batch, {
    submitTask: (_label, _kind, _description, run) => { executor = run; return { taskId: "test-task" } },
    getActiveTasks: () => [],
  })
  if (batch) {
    expect(response.status).toBe(200)
    expect(await executor!(() => {})).toMatchObject({ count: 0, failed: 1 })
  } else {
    expect(response.status).toBe(400)
  }
  expect(transcribe).not.toHaveBeenCalled()
})

it("preserves first upload, serving, single and batch transcription", async () => {
  expect(fs.existsSync(path.join(book, "audio"))).toBe(false)
  expect((await upload()).status).toBe(201)
  const audio = await createTTSRoutes(books, config).request(`/books/${label}/audio/en/${fileName}`)
  expect(audio.status).toBe(200)
  expect(await audio.text()).toBe("UPLOAD CANARY")
  let executor: TaskExecutor | undefined
  expect((await requestTranscription(true, {
    submitTask: (_label, _kind, _description, run) => { executor = run; return { taskId: "test-task" } },
    getActiveTasks: () => [],
  })).status).toBe(200)
  expect(await executor!(() => {})).toMatchObject({ count: 1, failed: 0 })
  expect((await requestTranscription()).status).toBe(200)
  expect(transcribe).toHaveBeenCalledTimes(2)
  expect(transcribe.mock.calls[0][0].audioBuffer.toString()).toBe("UPLOAD CANARY")
})

it("preserves legacy locale fallback, missing-file responses, normal images and assets", async () => {
  const audioDir = path.join(book, "audio", "pt_BR")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(path.join(audioDir, fileName), "LEGACY AUDIO")
  fs.mkdirSync(path.join(book, "images"), { recursive: true })
  fs.writeFileSync(path.join(book, "images", "sample.png"), "IMAGE")
  fs.writeFileSync(path.join(assets, "sample.css"), "CSS")
  const app = createAdtPreviewRoutes(books, assets, config)
  const audio = await app.request(`/books/${label}/adt-preview/content/i18n/pt-BR/audio/${fileName}`)
  expect(audio.status).toBe(200)
  expect(await audio.text()).toBe("LEGACY AUDIO")
  expect((await app.request(`/books/${label}/adt-preview/content/i18n/fr/audio/missing.wav`)).status).toBe(404)
  expect((await app.request(`/books/${label}/adt-preview/images/sample.png`)).status).toBe(200)
  expect((await app.request(`/books/${label}/adt-preview/assets/sample.css`)).status).toBe(200)
  expect((await app.request(`/books/${label}/adt-preview/images/missing.png`)).status).toBe(404)
  expect((await app.request(`/books/${label}/adt-preview/assets/missing.css`)).status).toBe(404)
})

it("preserves safe aliases and their MIME types when serving media", async () => {
  const audioDir = path.join(book, "audio", "en")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(path.join(audioDir, "actual"), "AUDIO")
  fs.symlinkSync(path.join(audioDir, "actual"), path.join(audioDir, fileName))
  fs.mkdirSync(path.join(book, "images"), { recursive: true })
  fs.writeFileSync(path.join(book, "images", "actual"), "IMAGE")
  fs.symlinkSync(path.join(book, "images", "actual"), path.join(book, "images", "sample.png"))
  fs.writeFileSync(path.join(assets, "actual"), "CSS")
  fs.symlinkSync(path.join(assets, "actual"), path.join(assets, "sample.css"))
  const app = createAdtPreviewRoutes(books, assets, config)
  for (const [suffix, contentType, content] of [
    [`content/i18n/en/audio/${fileName}`, "audio/wav", "AUDIO"],
    ["images/sample.png", "image/png", "IMAGE"],
    ["assets/sample.css", "text/css", "CSS"],
  ]) {
    const response = await app.request(`/books/${label}/adt-preview/${suffix}`)
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain(contentType)
    expect(await response.text()).toBe(content)
  }
})

it("unlinks an old audio alias without deleting its contained target", async () => {
  const audioDir = path.join(book, "audio", "en")
  fs.mkdirSync(audioDir, { recursive: true })
  const original = path.join(audioDir, "original.mp3")
  fs.writeFileSync(original, "PRESERVE ORIGINAL")
  const oldName = `${textId}.mp3`
  fs.symlinkSync(original, path.join(audioDir, oldName))
  const storage = createBookStorage(label, books)
  try {
    storage.putNodeData("tts", "en", { entries: [{ textId, language: "en", fileName: oldName, voice: "uploaded", model: "uploaded", cached: false, provider: "manual" }], generatedAt: new Date().toISOString() })
  } finally { storage.close() }
  expect((await upload()).status).toBe(201)
  expect(fs.existsSync(path.join(audioDir, oldName))).toBe(false)
  expect(fs.readFileSync(original, "utf8")).toBe("PRESERVE ORIGINAL")
  expect(fs.readFileSync(path.join(audioDir, fileName), "utf8")).toBe("UPLOAD CANARY")
})
