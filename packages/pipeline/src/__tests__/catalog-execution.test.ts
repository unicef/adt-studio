import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { translateCatalog, translationInputSignature } from "../catalog-translation.js"
import { prepareCoreTtsCatalog, resolveCoreTtsSpeechCatalog } from "../core-tts.js"
import { generateEasyRead } from "../easy-read.js"
import { inputSignature } from "../output-freshness.js"
import type { EasyReadOutput } from "@adt/types"

let directory: string
const transport = vi.fn<typeof fetch>()
let response: unknown
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "adt-catalog-transport-"))
  fs.writeFileSync(path.join(directory, "translate.liquid"), '{% chat role: "user" %}{{ target_language_code }}:{% for t in texts %}{{ t.text }}|{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(directory, "prepare.liquid"), '{% chat role: "user" %}{{ language }}:{% for e in entries %}{{ e.id }}:{{ e.display_text }}|{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(directory, "easy.liquid"), '{% chat role: "user" %}{{ section_text }}:{% for t in texts %}{{ t.text }}|{% endfor %}{% endchat %}')
  transport.mockReset().mockImplementation(async () => Response.json({
    id: "test", object: "chat.completion", created: 0, model: "test",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(response) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }))
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(directory, { recursive: true, force: true }) })
const translationConfig = { sourceLanguage: "en", modelId: "ollama:tinyllama", promptName: "translate", maxRetries: 0, batchSize: 50 }
function model(logs?: unknown[]) {
  return createLLMModel({ modelId: "ollama:tinyllama", promptEngine: createPromptEngine(directory), cacheDir: path.join(directory, ".cache"), logLevel: "silent", onLog: (entry) => logs?.push(entry) })
}

describe("catalog execution at the HTTP provider boundary", () => {
  it("measures a 120-phrase catalog: three initial batches, zero no-op/cache calls, one changed-output call, with usage logs", async () => {
    const entries = Array.from({ length: 120 }, (_, index) => ({ id: `pg${String(Math.floor(index / 10) + 1).padStart(3, "0")}_t${String(index % 10 + 1).padStart(3, "0")}`, text: `Phrase ${index}` }))
    const respond = transport.getMockImplementation()!
    transport.mockImplementation(async (...args) => {
      const messages = JSON.stringify(JSON.parse(String(args[1]?.body)).messages)
      response = { translations: [...messages.matchAll(/Phrase \d+(?: changed)?/g)].map(([text]) => `French ${text}`) }
      return respond(...args)
    })
    const logs: unknown[] = []
    const llmModel = model(logs)
    const first = await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel })
    expect(transport).toHaveBeenCalledTimes(3)
    expect(await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel, previous: first })).toBe(first)
    expect(transport).toHaveBeenCalledTimes(3)
    await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel })
    expect(transport).toHaveBeenCalledTimes(3)
    const changed = await translateCatalog({ entries: entries.map((entry, index) => index === 51 ? { ...entry, text: `${entry.text} changed` } : entry), language: "fr", config: translationConfig, llmModel, previous: first })
    expect(transport).toHaveBeenCalledTimes(4)
    expect(changed.entries.filter((entry, index) => entry.text !== first.entries[index].text)).toHaveLength(1)
    expect(logs.filter((entry) => !(entry as { cacheHit: boolean }).cacheHit)).toHaveLength(4)
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ cacheHit: false, usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5 }) }), expect.objectContaining({ cacheHit: true })]))
  })

  it("skips current translation, preserves protected neighbors, and distinguishes freshness from request caching", async () => {
    const entries = [{ id: "a", text: "Hello" }, { id: "b", text: "World" }]
    response = { translations: ["Bonjour", "Monde"] }
    const llmModel = model()
    const first = await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel })
    expect(transport).toHaveBeenCalledTimes(1)
    const noop = await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel, previous: first })
    expect(noop).toBe(first)
    expect(transport).toHaveBeenCalledTimes(1)
    await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel })
    expect(transport).toHaveBeenCalledTimes(1) // Identical complete request was cached.
    first.entries[1] = { id: "b", text: "My French", source: "manual" }
    response = { translations: ["Salut"] }
    const changed = await translateCatalog({ entries: [{ ...entries[0], text: "Hi" }, entries[1]], language: "fr", config: translationConfig, llmModel, previous: first })
    expect(transport).toHaveBeenCalledTimes(2)
    expect(changed.entries[1]).toEqual(first.entries[1])
    expect(changed.entries[0].text).toBe("Salut")
    expect(first.entries[0].text).toBe("Bonjour")
  })

  it("preserves unknown content and rejects replacement after the reviewed inputs change", async () => {
    const entry = { id: "a", text: "Hello" }
    const previous = { entries: [{ id: "a", text: "Legacy correction" }], generatedAt: "old" }
    const llmModel = model()
    expect(await translateCatalog({ entries: [entry], previous, language: "fr", config: translationConfig, llmModel })).toBe(previous)
    await expect(translateCatalog({ entries: [{ ...entry, text: "Changed" }], previous, language: "fr", config: translationConfig, llmModel,
      scope: { replace: [{ identity: { kind: "translation", id: "a", language: "fr" }, signature: translationInputSignature(entry, "fr", translationConfig), contentHash: inputSignature(previous.entries[0].text) }] },
    })).rejects.toThrow("changed since review")
    expect(transport).not.toHaveBeenCalled()
  })

  it("reuses fallback until explicitly retried, then keeps identical speech text", async () => {
    const config = { modelId: "ollama:tinyllama", promptName: "prepare", maxRetries: 0, batchSize: 50, latexToSpeech: true, languageNormalization: true }
    const entries = [{ id: "a", text: "Bonjour" }]
    const profile = { key: "fr", guidance: "Normalize" }
    const previous = resolveCoreTtsSpeechCatalog({ entries, language: "fr", config, profile })
    const llmModel = model()
    await prepareCoreTtsCatalog({ entries, language: "fr", config, profile, previous, llmModel })
    expect(transport).not.toHaveBeenCalled()
    response = { entries: [{ id: "a", speech_text: "Bonjour", transformation_kinds: [], failure_reason: null }] }
    const result = await prepareCoreTtsCatalog({ entries, language: "fr", config, profile, previous, llmModel, retryIds: ["a"] })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(result.entries[0].speechText).toBe(previous.entries[0].speechText)
    expect(result.entries[0].status).toBe("ready")
  })

  it("keeps full Easy Read section context while publishing only selected generated entries", async () => {
    const block: EasyReadOutput["blocks"][number] = { pageId: "pg001", pageNumber: 1, sectionId: "s1", sectionIndex: 0, sectionType: "text",
      entries: ["a", "b"].map((id) => ({ sourceId: id, easyReadId: `${id}_easy_read`, originalText: id, text: id, pageId: "pg001", sectionId: "s1", sectionIndex: 0 })) }
    const previous: EasyReadOutput = { generatedAt: "old", blocks: [{ ...block, entries: [{ ...block.entries[1], text: "My text", source: "manual" }] }] }
    response = { texts: ["Easy a"] }
    const result = await generateEasyRead([block], { enabled: true, language: "en", modelId: "ollama:tinyllama", promptName: "easy", maxRetries: 0, batchSize: 50, tts: true }, model(), { previous })
    expect(transport).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body))
    expect(JSON.stringify(body.messages)).toContain("a\\nb")
    expect(result.blocks[0].entries.map((entry) => entry.text)).toEqual(["Easy a", "My text"])
    expect(previous.blocks[0].entries[0].text).toBe("My text")
  })
})

it("discards a skipped translation returned by an in-flight provider and retries it on a later run", async () => {
  const scope: import("@adt/types").OutputRunScope = {}
  response = { translations: ["Bonjour"] }
  const respond = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => {
    scope.skip = [{ kind: "translation", id: "a", language: "fr" }]
    return respond(...args)
  })
  const llmModel = model()
  const entries = [{ id: "a", text: "Hello" }]
  const skipped = await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel, scope })
  expect(skipped.entries).toEqual([])
  const retried = await translateCatalog({ entries, language: "fr", config: translationConfig, llmModel, previous: skipped })
  expect(retried.entries[0].text).toBe("Bonjour")
  expect(transport).toHaveBeenCalledTimes(1) // Later request reuses the valid cached response.
})

it("bounds provider preparation failures and retains every requested phrase as fallback", async () => {
  transport.mockImplementation(async () => Response.json({ error: { message: "Bad request", type: "invalid_request_error" } }, { status: 400 }))
  const entries = [{ id: "a", text: "Bonjour" }, { id: "b", text: "Voisin" }]
  const config = { modelId: "ollama:tinyllama", promptName: "prepare", maxRetries: 0, batchSize: 50, latexToSpeech: true, languageNormalization: true }
  const result = await prepareCoreTtsCatalog({ entries, language: "fr", config, profile: { key: "fr", guidance: "Normalize" }, llmModel: model() })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(result.entries.map((entry) => [entry.id, entry.speechText, entry.fallbackReason])).toEqual([["a", "Bonjour", "failed"], ["b", "Voisin", "failed"]])
  const repeated = await prepareCoreTtsCatalog({ entries, language: "fr", config, profile: { key: "fr", guidance: "Normalize" }, llmModel: model(), previous: result })
  expect(repeated.entries).toEqual(result.entries)
  expect(transport).toHaveBeenCalledTimes(1)
})
