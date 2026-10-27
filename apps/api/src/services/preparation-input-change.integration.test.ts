import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { CoreTtsCatalogOutput, TTSOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"

let root: string
afterEach(() => { vi.unstubAllGlobals(); if (root) fs.rmSync(root, { recursive: true, force: true }) })

it.each(["prompt", "model", "profile", "neighbor"])("Speech preserves the next Language attempt after failed preparation and changed %s inputs", async change => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preparation-change-"))
  const booksDir = path.join(root, "books")
  const promptsDir = path.join(root, "prompts")
  const configDir = path.join(root, "config")
  fs.mkdirSync(promptsDir); fs.mkdirSync(configDir)
  const configPath = path.join(root, "config.yaml")
  const config = "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\noutput_languages: [en]\ncore_tts:\n  max_retries: 0\n  language_normalization: true\nspeech:\n  word_highlighting: false\n"
  fs.writeFileSync(configPath, config)
  const profilePath = path.join(configDir, "core_tts_profiles.yaml")
  fs.writeFileSync(profilePath, "en: Normalize English.\n")
  const promptPath = path.join(promptsDir, "core_tts_preparation.liquid")
  const template = '{% chat role: "user" %}PREPARE\n{% for e in entries %}ENTRY|{{ e.id }}|{{ e.display_text }}\n{% endfor %}{{ profile_guidance }}{% endchat %}'
  fs.writeFileSync(promptPath, template)
  const label = "changed"
  const storage = () => createBookStorage(label, booksDir)
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "S", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  const rendering = (neighbor = "Next phrase.") => ({ sections: [{ sectionIndex: 0, sectionId: "S", sectionType: "text", reasoning: "", html: `<section data-section-id="S"><p data-id="a">Hello world.</p><p data-id="b">${neighbor}</p></section>` }] })
  db.putNodeData("web-rendering", "pg001", rendering())
  db.close()
  let fail = true
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url, request) => {
    if (String(url).includes("/audio/speech")) return new Response(Buffer.from(String(request?.body)))
    if (fail) return Response.json({ error: { message: "Controlled preparation rejection", type: "invalid_request_error" } }, { status: 400 })
    const body = JSON.parse(String(request?.body))
    const prompt = body.messages.map((message: { content: string }) => message.content).join("\n") as string
    // Successful preparation deliberately leaves speech unchanged: matching audio must be reused.
    const object = { entries: [...prompt.matchAll(/ENTRY\|([^|\n]+)\|([^\n]+)/g)].map(([, id, text]) => ({ id, speech_text: text, transformation_kinds: [], failure_reason: null })) }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
  const run = (stage: "translate" | "speech") => createStageRunner().run(label, { booksDir, promptsDir, configPath, fromStage: stage, toStage: stage, credentials: { openai: { apiKey: "stub" } } }, { emit() {} })
  const read = () => {
    const current = storage()
    try { return current.getLatestNodeData("core-tts-catalog", "en")! as { version: number; data: CoreTtsCatalogOutput } }
    finally { current.close() }
  }
  const preparationCalls = () => transport.mock.calls.filter(([url]) => !String(url).includes("/audio/")).length
  await run("translate")
  const failed = read()
  expect(failed.data.entries.every(entry => entry.fallbackReason === "failed")).toBe(true)
  expect(preparationCalls()).toBe(1)
  await run("speech")
  await run("translate")
  expect(read()).toEqual(failed)
  expect(preparationCalls()).toBe(1)
  fail = false
  if (change === "prompt") fs.writeFileSync(promptPath, `${template}\nUpdated preparation instructions.\n`)
  if (change === "model") fs.writeFileSync(configPath, config.replace("ollama:tinyllama", "ollama:llama3.2"))
  if (change === "profile") fs.writeFileSync(profilePath, "en: Normalize English with revised pronunciation.\n")
  if (change === "neighbor") {
    const current = storage()
    current.putNodeData("web-rendering", "pg001", rendering("Changed neighbor."))
    current.close()
  }
  await run("speech")
  expect(preparationCalls()).toBe(1)
  const fallback = read()
  const entry = fallback.data.entries.find(item => item.id === "a")!
  expect(entry.displayText).toBe("Hello world.")
  expect(entry.input?.signature).not.toBe(failed.data.entries.find(item => item.id === "a")?.input?.signature)
  expect(entry.fallbackReason).toBe("outdated")
  await run("translate")
  expect(preparationCalls()).toBe(2)
  expect(read().data.entries.every(item => item.status === "ready" && !item.fallbackReason)).toBe(true)
  const calls = transport.mock.calls.length
  const retained = storage()
  const audio = retained.getLatestNodeData("tts", "en")
  const audioEntries = (audio!.data as TTSOutput).entries
  const audioBytes = audioEntries.map(item => fs.readFileSync(path.join(retained.bookDir!, "audio/en", item.fileName)))
  expect(retained.getAllNodeVersions("core-tts-catalog", "en").find(row => row.version === failed.version)?.data).toEqual(failed.data)
  retained.close()
  await run("speech")
  await run("translate")
  expect(transport).toHaveBeenCalledTimes(calls)
  const reopened = storage()
  expect((reopened.getLatestNodeData("tts", "en")!.data as TTSOutput).entries).toEqual(audioEntries)
  expect(audioEntries.map(item => fs.readFileSync(path.join(reopened.bookDir!, "audio/en", item.fileName)))).toEqual(audioBytes)
  expect(reopened.getAllNodeVersions("tts", "en").find(row => row.version === audio!.version)).toEqual(audio)
  reopened.close()
})
