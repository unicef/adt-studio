import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { buildEasyReadSourceBlocks, loadBookConfig, readOutputCatalog } from "@adt/pipeline"
import { createStageRunner } from "./stage-runner.js"

let root: string
afterEach(() => { vi.unstubAllGlobals(); if (root) fs.rmSync(root, { recursive: true, force: true }) })

it.each(["partial-easy-read", "missing-caption", "complete"])("Language and Speech reuse unchanged preparation with %s sources in both languages", async (scenario) => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-shared-speech-"))
  const booksDir = path.join(root, "books")
  const promptsDir = path.join(root, "prompts")
  const configDir = path.join(root, "config")
  fs.mkdirSync(promptsDir); fs.mkdirSync(configDir)
  const configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\noutput_languages: [en, fr]\neasy_read:\n  enabled: true\ncore_tts:\n  max_retries: 0\nspeech:\n  word_highlighting: false\n")
  fs.writeFileSync(path.join(configDir, "core_tts_profiles.yaml"), "en: Normalize English.\nfr: Normalize French.\n")
  fs.writeFileSync(path.join(promptsDir, "translation.liquid"), '{% chat role: "user" %}TRANSLATE\n{% for t in texts %}TEXT|{{ t.text }}\n{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(promptsDir, "core_tts_preparation.liquid"), '{% chat role: "user" %}PREPARE\n{% for e in entries %}ENTRY|{{ e.id }}|{{ e.display_text }}|{{ e.previous_display_text }}|{{ e.next_display_text }}\n{% endfor %}{% endchat %}')
  const label = "shared"
  const storage = () => createBookStorage(label, booksDir)
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  db.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "text", reasoning: "", html: `<section data-section-id="pg001_sec001"><p data-id="a">First</p><p data-id="b">Second</p>${scenario === "missing-caption" ? '<img data-id="pg001_im001"/>' : ""}</section>` }] })
  const blocks = buildEasyReadSourceBlocks(db, db.getPages())
  blocks[0].entries = blocks[0].entries.filter((entry) => scenario !== "partial-easy-read" || entry.sourceId === "a").map((entry) => ({ ...entry, text: `Easy ${entry.originalText}`, source: "manual" }))
  db.putNodeData("easy-read", "book", { generatedAt: "before", blocks })
  db.close()
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url, request) => {
    if (String(url).includes("/audio/speech")) return new Response(Buffer.from(String(request?.body)))
    const body = JSON.parse(String(request?.body))
    const prompt = body.messages.map((message: { content: string }) => message.content).join("\n") as string
    const object = prompt.includes("PREPARE")
      ? { entries: [...prompt.matchAll(/ENTRY\|([^|\n]+)\|([^|\n]+)\|[^\n]*/g)].map(([, id, text]) => ({ id, speech_text: `${text} spoken`, transformation_kinds: ["language-normalization"], failure_reason: null })) }
      : { translations: [...prompt.matchAll(/TEXT\|([^\n]+)/g)].map(([, text]) => `French ${text}`) }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
  const run = (stage: "translate" | "speech") => createStageRunner().run(label, { booksDir, promptsDir, configPath, fromStage: stage, toStage: stage, credentials: { openai: { apiKey: "stub" } } }, { emit() {} })
  const state = () => {
    const current = storage()
    try {
      const outputs = readOutputCatalog({ storage: current, config: loadBookConfig(label, booksDir, configPath), bookDir: current.bookDir!, promptsDir, configDir })
      for (const output of outputs.filter((entry) => entry.identity.kind === "preparation" && entry.usable)) {
        expect(output.warnings.some((warning) => warning.reason.startsWith("preparation-"))).toBe(false)
      }
      return ["en", "fr"].map((language) => current.getLatestNodeData("core-tts-catalog", language))
    } finally { current.close() }
  }
  await run("translate")
  const prepared = state()
  const preparationCalls = () => transport.mock.calls.filter(([url]) => !String(url).includes("/audio/")).length
  const firstCalls = preparationCalls()
  expect(firstCalls).toBeGreaterThan(0)
  await run("speech")
  expect(state()).toEqual(prepared)
  const allCalls = transport.mock.calls.length
  await run("translate")
  await run("speech")
  await run("translate")
  expect(state()).toEqual(prepared)
  expect(preparationCalls()).toBe(firstCalls)
  expect(transport).toHaveBeenCalledTimes(allCalls)
})
