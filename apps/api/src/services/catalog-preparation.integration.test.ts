import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { loadBookConfig, readOutputCatalog } from "@adt/pipeline"
import type { CoreTtsCatalogOutput, TextCatalogOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"

let root: string
const transport = vi.fn<typeof fetch>()
const label = "catalog-review"
const storage = () => createBookStorage(label, path.join(root, "books"))
const options = () => ({ booksDir: path.join(root, "books"), promptsDir: path.join(root, "prompts"), configPath: path.join(root, "config.yaml"), fromStage: "translate", toStage: "translate" })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-review-"))
  fs.mkdirSync(path.join(root, "prompts"))
  fs.mkdirSync(path.join(root, "config"))
  fs.writeFileSync(path.join(root, "config.yaml"), "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\noutput_languages: [fr-FR]\ncore_tts:\n  max_retries: 0\n")
  fs.writeFileSync(path.join(root, "prompts", "translation.liquid"), '{% chat role: "user" %}TRANSLATE\n{% for t in texts %}TEXT|{{ t.text }}\n{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(root, "prompts", "core_tts_preparation.liquid"), '{% chat role: "user" %}PREPARE\n{% for e in entries %}ENTRY|{{ e.id }}|{{ e.display_text }}|{{ e.previous_display_text }}|{{ e.next_display_text }}\n{% endfor %}{% endchat %}')
  const seed = storage()
  seed.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "source", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 10, height: 10 }, images: [] })
  seed.putNodeData("metadata", "book", { language_code: "en" })
  seed.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] })
  seed.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", reasoning: "", html: '<p data-id="a">Hello</p><p data-id="b">World</p>' }] })
  seed.close()
  transport.mockReset().mockImplementation(async (_url, request) => {
    const body = JSON.parse(String(request?.body))
    const prompt = body.messages.map((message: { content: string }) => message.content).join("\n") as string
    const object = prompt.includes("PREPARE") ? { entries: [...prompt.matchAll(/ENTRY\|([^|\n]+)\|([^|\n]+)\|[^\n]*/g)].map(([, id, text]) => ({ id, speech_text: text, transformation_kinds: [], failure_reason: null })) }
      : { translations: [...prompt.matchAll(/TEXT\|([^\n]+)/g)].map(([, text]) => `Generated ${text}`) }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("keeps manual translations stored under a legacy locale key on ordinary Translate", async () => {
  const seed = storage()
  const previous: TextCatalogOutput = { entries: [{ id: "a", text: "Correction A", source: "manual" }, { id: "b", text: "Correction B" }], generatedAt: "old" }
  seed.putNodeData("text-catalog-translation", "fr_FR", previous)
  seed.close()
  await createStageRunner().run(label, options(), { emit: () => undefined })
  const verify = storage()
  try {
    const active = verify.getLatestNodeData("text-catalog-translation", "fr-FR") ?? verify.getLatestNodeData("text-catalog-translation", "fr_FR")
    expect(active?.data).toEqual(previous)
    expect(verify.getLatestNodeData("text-catalog-translation", "fr_FR")?.data).toEqual(previous)
    expect(transport).not.toHaveBeenCalled()
  } finally { verify.close() }
})

it("replaces a legacy translation and its speech text together without stale replacement guards", async () => {
  await createStageRunner().run(label, options(), { emit: () => {} })
  const db = storage()
  try {
    const translated = db.getLatestNodeData("text-catalog-translation", "fr-FR")!.data as TextCatalogOutput
    const prepared = db.getLatestNodeData("core-tts-catalog", "fr-FR")!.data as CoreTtsCatalogOutput
    db.putNodeData("text-catalog-translation", "fr-FR", { ...translated, entries: translated.entries.map(({ source: _source, input: _input, ...entry }) => entry) })
    db.putNodeData("core-tts-catalog", "fr-FR", { ...prepared, entries: prepared.entries.map(({ source: _source, input: _input, ...entry }) => entry) })
    db.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", reasoning: "", html: '<p data-id="a">Changed sentence</p><p data-id="b">World</p>' }] })
    const read = () => readOutputCatalog({ storage: db, config: loadBookConfig(label, options().booksDir, options().configPath), bookDir: db.bookDir!, promptsDir: options().promptsDir, configDir: path.join(root, "config") })
    const targets = read().filter(output => output.identity.id === "a" && output.identity.language === "fr-FR" && ["translation", "preparation"].includes(output.identity.kind))
    expect(targets).toHaveLength(2)
    expect(targets.every(output => output.protected)).toBe(true)
    transport.mockClear()
    await createStageRunner().run(label, { ...options(), outputScope: {
      selection: { identities: targets.map(output => output.identity) },
      replace: targets.map(({ identity, signature, contentHash }) => ({ identity, signature, contentHash })),
    } }, { emit: () => {} })
    const result = read().filter(output => output.identity.id === "a" && output.identity.language === "fr-FR" && ["translation", "preparation"].includes(output.identity.kind))
    expect(result.every(output => output.current && !output.protected && !output.warnings.length)).toBe(true)
    expect(result.every(output => output.text === "Generated Changed sentence")).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    expect((db.getLatestNodeData("text-catalog-translation", "fr-FR")!.data as TextCatalogOutput).entries.find(entry => entry.id === "b")!.text).toBe("Generated World")
  } finally { db.close() }
})

it("prepares translated speech in current source order after a move, independent of retained translation order", async () => {
  fs.writeFileSync(path.join(root, "config", "core_tts_profiles.yaml"), "fr: Normalize French.\n")
  const seed = storage()
  seed.putNodeData("text-catalog-translation", "fr-FR", { entries: [{ id: "b", text: "Monde", source: "manual" }, { id: "a", text: "Bonjour", source: "manual" }], generatedAt: "old" })
  seed.close()
  await createStageRunner().run(label, options(), { emit: () => undefined })
  expect(transport).toHaveBeenCalledTimes(1)
  const prompt = JSON.stringify(JSON.parse(String(transport.mock.calls[0][1]?.body)).messages)
  expect(prompt).toContain("ENTRY|a|Bonjour||Monde")
  expect(prompt).toContain("ENTRY|b|Monde|Bonjour|")
  const verify = storage()
  try {
    const outputs = readOutputCatalog({ storage: verify, config: loadBookConfig(label, options().booksDir, options().configPath), bookDir: verify.bookDir!, promptsDir: options().promptsDir, configDir: path.join(root, "config") })
    const preparation = outputs.filter((output) => output.identity.kind === "preparation" && output.identity.language === "fr-FR")
    expect(preparation).toHaveLength(2)
    expect(preparation.every((output) => !output.warnings.some((warning) => warning.reason.startsWith("preparation-")))).toBe(true)
  } finally { verify.close() }
})


it.each(["ordinary", "retry"])("%s Language run repairs legacy null-speech failures with one transport call and retains manual speech", async action => {
  fs.writeFileSync(path.join(root, "config", "core_tts_profiles.yaml"), "fr: Normalize French.\n")
  const seed = storage()
  seed.putNodeData("text-catalog-translation", "fr-FR", {entries: [{id: "a", text: "Bonjour", source: "manual"}, {id: "b", text: "Monde", source: "manual"}], generatedAt: "legacy"})
  const legacy: CoreTtsCatalogOutput = {language: "fr-FR", generatedAt: "legacy", entries: [
    {id: "a", displayText: "Bonjour", speechText: null, status: "failed", changed: false, transformations: [], failureReason: "Old failure", generation: {mode: "generated", generatedAt: "legacy", enabledTransformations: ["language-normalization"], sourceTextHash: "old", contextHash: "old"}},
    {id: "b", displayText: "Monde", speechText: "Manual pronunciation", status: "ready", changed: true, transformations: [], generation: {mode: "manual", generatedAt: "legacy", enabledTransformations: [], sourceTextHash: "old", contextHash: "old"}},
  ]}
  seed.putNodeData("core-tts-catalog", "fr-FR", legacy)
  seed.close()
  await createStageRunner().run(label, {...options(), ...(action === "retry" ? {outputScope: {selection: {kinds: ["preparation" as const], ids: ["a"]}, retry: [{kind: "preparation" as const, id: "a", language: "fr-FR"}]}} : {})}, {emit: () => {}})
  expect(transport).toHaveBeenCalledTimes(1)
  const verify = storage()
  const result = verify.getLatestNodeData("core-tts-catalog", "fr-FR")!.data as CoreTtsCatalogOutput
  expect(result.entries.find(entry => entry.id === "a")).toMatchObject({status: "ready", speechText: "Bonjour", source: "ai"})
  expect(result.entries.find(entry => entry.id === "b")).toEqual(legacy.entries[1])
  expect(verify.getAllNodeVersions("core-tts-catalog", "fr-FR").some(row => JSON.stringify(row.data) === JSON.stringify(legacy))).toBe(true)
  verify.close()
  await createStageRunner().run(label, options(), {emit: () => {}})
  expect(transport).toHaveBeenCalledTimes(1)
})
