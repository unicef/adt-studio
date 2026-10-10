import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createOutputRoutes } from "./outputs.js"
import { createTTSRoutes } from "./tts.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"
import type { OutputStatus, TTSOutput } from "@adt/types"

let root: string
let app: Hono
const label = "speech"
const transport = vi.fn<typeof fetch>()
const prompts = path.resolve("prompts")
const db = () => createBookStorage(label, root)
const request = (body: Record<string, unknown> = {}, signal?: AbortSignal) => app.request(`/books/${label}/tts/generate-one`, {
  method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "test-transport-key" }, signal,
  body: JSON.stringify({ textId: "stable", language: "fr", ...body }),
})
async function outputs(): Promise<OutputStatus[]> { return (await (await app.request(`/books/${label}/outputs`)).json()).outputs }
function audio() { const storage = db(); try { return storage.getLatestNodeData("tts", "fr") as { data: TTSOutput; version: number } | null } finally { storage.close() } }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "speech-freshness-"))
  const storage = db()
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("text-catalog", "book", { entries: [{ id: "stable", text: "Hello" }, { id: "neighbor", text: "World" }], generatedAt: "then" })
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "stable", text: "Bonjour", source: "manual" }, { id: "neighbor", text: "Voisin", source: "manual" }], generatedAt: "then" })
  fs.writeFileSync(path.join(storage.bookDir!, "config.yaml"), "output_languages: [en, fr]\ncore_tts:\n  language_normalization: true\nspeech:\n  default_provider: openai\n  model: gpt-4o-mini-tts\n")
  storage.close()
  app = new Hono().use("/books/:label/*", bookWriterMiddleware(root)).route("/", createTTSRoutes(root, undefined, undefined, prompts)).route("/", createOutputRoutes(root, prompts))
  app.onError(errorHandler)
  transport.mockReset().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/mpeg" } }))
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("uses requested-language fallback without Translate, reuses audio after cache cleanup and review, and keeps the upstream warning", async () => {
  const first = await request()
  expect(first.status, await first.clone().text()).toBe(200)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(String(transport.mock.calls[0][0])).toContain("/audio/speech")
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).input).toBe("Bonjour")
  const original = audio()!
  const planned = (await outputs()).find((output) => output.identity.kind === "audio" && output.identity.id === "stable" && output.identity.language === "fr")!
  expect(original.data.entries[0].speechInputSignature).toBe(planned.signature)
  expect(fs.readFileSync(path.join(root, label, "audio", "fr", original.data.entries[0].fileName))).toEqual(Buffer.from([1, 2, 3, 4]))
  fs.rmSync(path.join(root, label, ".cache"), { recursive: true, force: true })
  expect((await request()).status).toBe(200)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(audio()).toEqual(original)
  const before = await outputs()
  const translation = before.find((output) => output.identity.kind === "translation" && output.identity.id === "stable")!
  expect(before.find((output) => output.identity.kind === "audio" && output.identity.language === "fr" && output.identity.id === "stable")?.warnings.length).toBeGreaterThan(0)
  const reviewed = await app.request(`/books/${label}/outputs/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: translation.identity, signature: translation.signature, contentHash: translation.contentHash, action: "keep" }) })
  expect(reviewed.status).toBe(200)
  expect((await request()).status).toBe(200)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(audio()).toEqual(original)
})

it.each(["source", "target", "exclusion", "cancel"] as const)("rejects late %s changes after synthesis and keeps the previous playable file", async (kind) => {
  expect((await request()).status).toBe(200)
  const original = audio()!
  const bytes = fs.readFileSync(path.join(root, label, "audio", "fr", original.data.entries[0].fileName))
  const status = (await outputs()).find((output) => output.identity.kind === "audio" && output.identity.id === "stable" && output.identity.language === "fr")!
  fs.rmSync(path.join(root, label, ".cache"), { recursive: true, force: true })
  const controller = new AbortController()
  transport.mockImplementation(async () => {
    if (kind === "cancel") controller.abort()
    else {
      const storage = db()
      try {
        if (kind === "source") storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "stable", text: "Modifié", source: "manual" }], generatedAt: "during" })
        if (kind === "target") storage.putNodeData("tts", "fr", { ...original.data, entries: original.data.entries.map((entry) => ({ ...entry, provider: "manual", source: "manual" })) })
        if (kind === "exclusion") fs.appendFileSync(path.join(storage.bookDir!, "config.yaml"), "  excluded_text_ids: [stable]\n")
      } finally { storage.close() }
    }
    return new Response(new Uint8Array([9, 9, 9]))
  })
  const result = await request({ replacement: { identity: status.identity, signature: status.signature, contentHash: status.contentHash } }, controller.signal)
  expect(result.status).toBeGreaterThanOrEqual(400)
  const after = audio()!
  expect(after.data.entries[0].fileName).toBe(original.data.entries[0].fileName)
  expect(fs.readFileSync(path.join(root, label, "audio", "fr", original.data.entries[0].fileName))).toEqual(bytes)
  if (kind === "target") expect(after.data.entries[0].source).toBe("manual")
  else expect(after).toEqual(original)
})
