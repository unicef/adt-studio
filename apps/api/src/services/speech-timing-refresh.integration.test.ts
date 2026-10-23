import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { TTSOutput, WordTimestampOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"
import { loadBookConfig, readOutputCatalog } from "@adt/pipeline"

let root: string
const label = "timing-refresh"
const transport = vi.fn<typeof fetch>()
const storage = () => createBookStorage(label, root)
const configure = (model = "gpt-4o-mini-tts", voice = "alloy") => fs.writeFileSync(path.join(root, label, "config.yaml"), `editing_language: en\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\nspeech:\n  default_provider: openai\n  model: ${model}\n  word_highlighting: true\n  primary_voices:\n    openai:\n      en:\n        voice: ${voice}\n`)
const run = () => createStageRunner().run(label, { booksDir: root, promptsDir: path.resolve("prompts"), fromStage: "speech", toStage: "speech", credentials: { openai: { apiKey: "stub-transport" } } }, { emit: () => undefined })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "timing-refresh-"))
  const db = storage()
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("text-catalog", "book", { entries: [{ id: "stable", text: "Hello" }], generatedAt: "before" })
  db.close()
  configure()
  let synthesis = 0
  transport.mockReset().mockImplementation(async (url) => {
    if (String(url).includes("/audio/speech")) return new Response(Buffer.from(`audio bytes ${++synthesis}`))
    if (String(url).includes("/audio/transcriptions")) return Response.json({ text: "Hello", duration: 1, words: [{ word: "Hello", start: 0, end: 0.8 }] })
    throw new Error(`Unexpected provider URL: ${url}`)
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it.each(["model", "voice"])("refreshes timings for new audio after only the %s changes, and reuses both on a no-op", async (change) => {
  await run()
  configure(change === "model" ? "tts-1" : "gpt-4o-mini-tts", change === "voice" ? "onyx" : "alloy")
  await run()
  expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/speech"))).toHaveLength(2)
  expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/transcriptions"))).toHaveLength(2)
  const db = storage()
  const audio = db.getLatestNodeData("tts", "en")!.data as TTSOutput
  const timing = db.getLatestNodeData("tts-timestamps", "en")!.data as WordTimestampOutput
  expect(Object.values(timing.entries)).toHaveLength(1)
  expect(Object.values(timing.entries)[0].audioHash).toBe(audio.entries[0].audioHash)
  db.close()
  await run()
  expect(transport).toHaveBeenCalledTimes(4)
})

it("AC-6/8/10 ordinary reuse trusts recorded audio identity after an external same-name edit", async () => {
  await run()
  const db = storage()
  const before = db.getLatestNodeData("tts", "en")!.data as TTSOutput
  const file = path.join(db.bookDir!, "audio/en", before.entries[0].fileName)
  fs.writeFileSync(file, "CORRUPTED")
  db.close()
  await run()
  const reopened = storage()
  const after = reopened.getLatestNodeData("tts", "en")!.data as TTSOutput
  expect(after.entries[0].fileName).toBe(before.entries[0].fileName)
  expect(fs.readFileSync(file, "utf8")).toBe("CORRUPTED")
  expect(fs.readFileSync(path.join(reopened.bookDir!, "audio/en", after.entries[0].fileName), "utf8")).toBe("CORRUPTED")
  const outputs = readOutputCatalog({ storage: reopened, config: loadBookConfig(label, root), bookDir: reopened.bookDir!, promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  expect(outputs.filter((output) => output.identity.kind === "audio")).toEqual([expect.objectContaining({ usable: true, current: true, missing: false })])
  reopened.close()
  await run()
  expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/speech"))).toHaveLength(1)
})

it("audio-only regeneration creates timings for the new recording and retains the manually timed historical pair", async () => {
  await run()
  const db = storage()
  const oldAudio = db.getLatestNodeData("tts", "en")!
  const oldTiming = db.getLatestNodeData("tts-timestamps", "en")!.data as WordTimestampOutput
  db.putNodeData("tts-timestamps", "en", { ...oldTiming, entries: Object.fromEntries(Object.entries(oldTiming.entries).map(([key, entry]) => [key, { ...entry, source: "manual", words: [{ word: "Manually timed", start: 0.2, end: 0.9 }] }])) })
  const manual = db.getLatestNodeData("tts-timestamps", "en")!
  db.close()
  configure("tts-1")
  await createStageRunner().run(label, { booksDir: root, promptsDir: path.resolve("prompts"), fromStage: "speech", toStage: "speech", credentials: { openai: { apiKey: "stub-transport" } }, outputScope: { selection: { kinds: ["audio"], ids: ["stable"], languages: ["en"] } } }, { emit: () => undefined })
  expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/speech"))).toHaveLength(2)
  expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/transcriptions"))).toHaveLength(2)
  const reopened = storage()
  const audio = reopened.getLatestNodeData("tts", "en")!.data as TTSOutput
  const timings = reopened.getLatestNodeData("tts-timestamps", "en")!.data as WordTimestampOutput
  expect(timings.entries.stable.audioHash).toBe(audio.entries[0].audioHash)
  expect(timings.entries.stable.source).toBe("ai")
  expect(reopened.getAllNodeVersions("tts-timestamps", "en")).toContainEqual(manual)
  expect(reopened.getAllNodeVersions("tts", "en")).toContainEqual(oldAudio)
  const oldFile = (oldAudio.data as TTSOutput).entries[0].fileName
  expect(fs.existsSync(path.join(reopened.bookDir!, "audio/en", oldFile))).toBe(true)
  reopened.close()
})

it.each(["stage", "single", "batch"])("%s transcription uses stored identity without hashing retained audio", async (entrypoint) => {
  await run()
  const db = storage()
  const audio = (db.getLatestNodeData("tts", "en")!.data as TTSOutput).entries[0]
  db.putNodeData("tts-timestamps", "en", { entries: {}, generatedAt: "removed-current-timing" })
  db.close()
  // Remove only the disposable alignment cache to prove the real transport is
  // reached once; subsequent transcription reuses the same persisted identity.
  fs.rmSync(path.join(root, label, ".cache", "word-timestamps"), { recursive: true, force: true })
  const crypto = (await import("node:crypto")).default
  const create = crypto.createHash
  let binaryHashes = 0
  const spy = vi.spyOn(crypto, "createHash").mockImplementation((...args) => {
    const hash = create(...args)
    const update = hash.update.bind(hash)
    hash.update = ((value: Parameters<typeof hash.update>[0], ...rest: [BufferEncoding?]) => {
      if (ArrayBuffer.isView(value)) binaryHashes++
      return update(value, ...rest as [BufferEncoding])
    }) as typeof hash.update
    return hash
  })
  try {
    if (entrypoint === "stage") await run()
    else {
      const { createTTSRoutes } = await import("../routes/tts.js")
      const { createTaskService } = await import("./task-service.js")
      const { createBookEventBus } = await import("./book-event-bus.js")
      const bus = createBookEventBus()
      const tasks = createTaskService(bus, root)
      let finished = false
      let error: unknown
      const remove = bus.addListener(label, (event) => {
        if (event.type === "task" && event.data.type === "task-complete") finished = true
        if (event.type === "task" && event.data.type === "task-error") { error = event.data; finished = true }
      })
      try {
        const app = createTTSRoutes(root, undefined, tasks)
        const response = await app.request(`/books/${label}/tts/transcribe-${entrypoint === "single" ? "one" : "all"}`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "stub-transport" },
          body: JSON.stringify({ language: "en", ...(entrypoint === "single" ? { textId: "stable" } : {}) }),
        })
        expect(response.status).toBe(200)
        if (entrypoint === "batch") await vi.waitFor(() => expect(finished).toBe(true))
        expect(error).toBeUndefined()
      } finally { remove() }
    }
    expect(binaryHashes).toBe(0)
    expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/transcriptions"))).toHaveLength(2)
    const reopened = storage()
    try {
      const timing = reopened.getLatestNodeData("tts-timestamps", "en")!.data as WordTimestampOutput
      expect(timing.entries.stable.audioHash).toBe(audio.audioHash)
      expect((reopened.getLatestNodeData("tts", "en")!.data as TTSOutput).entries[0].fileName).toBe(audio.fileName)
    } finally { reopened.close() }
    await run()
    expect(transport.mock.calls.filter(([url]) => String(url).includes("/audio/transcriptions"))).toHaveLength(2)
  } finally { spy.mockRestore() }
})
