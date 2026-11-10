import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { buildTextCatalogSnapshot } from "@adt/pipeline"
import { createBookTools } from "../tools/book-tools.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
let tools: ReturnType<typeof createBookTools>["tools"]
const section = (id: string) => ({ sectionId: id, sectionType: "text_only", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] })
const rendered = (owner: string, id: string, text: string) => ({ sectionIndex: 0, sectionId: owner, sectionType: "text_only", reasoning: "", html: `<section data-section-id="${owner}"><p data-id="${id}">${text}</p></section>` })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-assistant-identity-"))
  const booksDir = path.join(root, "books")
  const promptsDir = path.join(root, "prompts")
  fs.mkdirSync(promptsDir)
  const configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\ndefault_render_strategy: activity\nrender_strategies:\n  activity:\n    render_type: activity\n    config:\n      prompt: render\n      max_retries: 0\n")
  fs.writeFileSync(path.join(promptsDir, "render.liquid"), '{% chat role: "user" %}render {{ section_id }} {{ section }}{% endchat %}')
  storage = createBookStorage("book", booksDir)
  for (const [pageId, owner, id, text] of [["pg001", "pg001_sec001", "own", "Original question"], ["pg002", "pg002_sec001", "foreign", "Other question"]]) {
    storage.putExtractedPage({ pageId, pageNumber: pageId === "pg001" ? 1 : 2, text: "", pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [{ imageId: "shared-image", buffer: Buffer.from("image"), format: "png", hash: "image", width: 1, height: 1 }] })
    storage.putNodeData("page-sectioning", pageId, { reasoning: "", sections: [section(owner)] })
    storage.putNodeData("web-rendering", pageId, { sections: [rendered(owner, id, text)] })
  }
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "foreign", text: "Correction manuelle", source: "manual" }], generatedAt: "before" })
  tools = createBookTools({ storage, bookLabel: "book", booksDir, promptsDir, configPath, credentials: {} }).tools
})
afterEach(() => { vi.unstubAllGlobals(); storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

function renderer(id: string, extraHtml = "") {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ reasoning: "test", content: `<div id="content"><section data-section-id="pg001_sec002" data-section-type="activity_open_ended_answer"><p data-id="${id}" class="adt-body">New question</p><img data-id="shared-image" src="shared-image.png"/>${extraHtml}<textarea data-id="activity_gen_input1" aria-label="Answer"></textarea></section></div>` }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  vi.stubGlobal("fetch", transport)
  return transport
}

it.each(["active", "retired", "duplicate", "renderer"])("templated creation rejects %s identity reuse without publishing either entity", async mode => {
  if (mode === "retired") storage.putNodeData("web-rendering", "pg002", { sections: [] })
  if (mode === "renderer") storage.putNodeData("web-rendering", "pg002", { sections: [rendered("pg002_sec001", "activity_gen_input1", "Previous input")] })
  const transport = renderer("new-question")
  const id = mode === "active" || mode === "retired" ? "foreign" : "new-question"
  const nodes = [{ nodeId: id, role: "activity_question", text: "New question" }]
  if (mode === "duplicate") nodes.push({ nodeId: id, role: "text", text: "Different text" })
  const before = storage.getNodeVersionFingerprint()
  const correction = storage.getLatestNodeData("text-catalog-translation", "fr")
  expect(await tools.createTemplatedActivity!.execute!({ pageId: "pg001", sectionType: "activity_open_ended_answer", sectioningJson: JSON.stringify({ reasoning: "test", nodes }), userInstructions: null }, {} as never))
    .toMatchObject({ ok: false, error: expect.stringContaining("data-id") })
  expect(transport).toHaveBeenCalledTimes(mode === "renderer" ? 1 : 0)
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction)
})

it("templated creation permits fresh text and a shared image through the real renderer", async () => {
  const transport = renderer("new-question")
  const correction = storage.getLatestNodeData("text-catalog-translation", "fr")
  const result = await tools.createTemplatedActivity!.execute!({ pageId: "pg001", sectionType: "activity_open_ended_answer", sectioningJson: JSON.stringify({ reasoning: "test", nodes: [{ nodeId: "new-question", role: "activity_question", text: "New question" }, { nodeId: "shared-image", role: "image" }] }), userInstructions: null }, {} as never)
  expect((result as { error?: string }).error).toBeUndefined()
  expect(result).toMatchObject({ ok: true, sectionId: "pg001_sec002" })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(buildTextCatalogSnapshot(storage, storage.getPages()).entries.find(entry => entry.id === "new-question")?.text).toBe("New question")
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction)
})

it.each(["active", "retired", "duplicate", "changed-conflict", "cosmetic-conflict"])("assistant edit safely handles %s identities", async mode => {
  if (mode === "retired") storage.putNodeData("web-rendering", "pg002", { sections: [] })
  const legacy = mode.endsWith("conflict")
  if (legacy) storage.putNodeData("web-rendering", "pg001", { sections: [rendered("pg001_sec001", "foreign", "Legacy conflicting text")] })
  const before = storage.getNodeVersionFingerprint()
  const history = storage.getAllNodeVersions("web-rendering", "pg001")
  const correction = storage.getLatestNodeData("text-catalog-translation", "fr")
  const html = mode === "cosmetic-conflict" ? '<section class="p-8"><p data-id="foreign">Legacy conflicting text</p><img data-id="shared-image"/></section>'
    : mode === "changed-conflict" ? '<section><p data-id="foreign">Changed conflicting text</p></section>'
    : mode === "duplicate" ? '<section><p data-id="own">One</p><p data-id="own">Two</p></section>'
    : '<section><p data-id="own">Original question</p><p data-id="foreign">New unrelated question</p></section>'
  const result = await tools.updateSection!.execute!({ pageId: "pg001", sectionIndex: 0, html, reasoning: "edit", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: mode === "cosmetic-conflict" })
  if (mode !== "cosmetic-conflict") expect(storage.getNodeVersionFingerprint()).toEqual(before)
  for (const row of history) expect(storage.getAllNodeVersions("web-rendering", "pg001")).toContainEqual(row)
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction)
})

// Retired output can outlive every source row that originally supplied it.
it.each([
  ["glossary", "book", { items: [{ id: "retired", word: "Apple", definition: "A fruit", variations: [], emojis: [] }] }, "retired_def"],
  ["quiz-generation", "book", { quizzes: [{ quizId: "qz001", question: "Old question", options: [{ text: "Apple", explanation: "A fruit" }] }] }, "qz001_o0_exp"],
  ["text-catalog", "book", { entries: [{ id: "retired", text: "Old source" }] }, "retired"],
  ["text-catalog-translation", "fr", { entries: [{ id: "retired", text: "Correction", source: "manual" }] }, "retired"],
  ["core-tts-catalog", "fr", { entries: [{ id: "retired", speechText: "Correction", source: "manual" }] }, "retired"],
  ["easy-read", "book", { blocks: [{ entries: [{ sourceId: "old-source", easyReadId: "retired", text: "Old simpler text" }] }] }, "retired"],
  ["tts", "fr", { entries: [{ textId: "retired", fileName: "old.wav", source: "manual" }] }, "retired"],
] as const)("new assistant content cannot acquire retired %s identity", async (node, item, data, id) => {
  storage.putNodeData(node, item, data)
  storage.putNodeData(node, item, {})
  const before = storage.getNodeVersionFingerprint()
  const result = await tools.createCustomSection!.execute!({ pageId: "pg001", sectionType: "content", html: `<section><p data-id="${id}">Unrelated new instruction</p></section>`, reasoning: "new", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining(id) })
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  expect(buildTextCatalogSnapshot(storage, storage.getPages()).entries.some(entry => entry.id === id)).toBe(false)
})


it.each([["source", "source_easy_read"], ["source_easy_read", "source"], ["source_easy_read", "source_easy_read_easy_read"]])("reserves the future Easy Read identity %s against %s", async (occupied, proposed) => {
  storage.putNodeData("web-rendering", "pg002", { sections: [rendered("pg002_sec001", occupied, "Existing text")] })
  const before = storage.getNodeVersionFingerprint()
  const result = await tools.createCustomSection!.execute!({ pageId: "pg001", sectionType: "content", html: `<section><p data-id="${proposed}">Unrelated new text</p></section>`, reasoning: "new", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining(proposed) })
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})


it("rejects two new source IDs that would occupy the same future Easy Read slot", async () => {
  const before = storage.getNodeVersionFingerprint()
  const result = await tools.createCustomSection!.execute!({ pageId: "pg001", sectionType: "content", html: '<section><p data-id="fresh">New source</p><p data-id="fresh_easy_read">Different source</p></section>', reasoning: "new", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("fresh_easy_read") })
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it.each(["", "   ", "\t"])("rejects new blank custom content IDs %j before publication", async id => {
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id, text: "Retained manual correction", source: "manual" }] })
  const before = storage.getNodeVersionFingerprint()
  const transport = renderer("unused")
  const result = await tools.createCustomSection!.execute!({ pageId: "pg001", sectionType: "content", html: `<section><p data-id="${id}">Unrelated new instruction</p></section>`, reasoning: "new", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("non-blank data-id") })
  expect(transport).not.toHaveBeenCalled()
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  expect(buildTextCatalogSnapshot(storage, storage.getPages()).entries.some(entry => entry.id === id)).toBe(false)
})

it.each(["", "   "])("rejects blank templated source ID %j before calling the provider", async id => {
  const transport = renderer("new-question")
  const before = storage.getNodeVersionFingerprint()
  const result = await tools.createTemplatedActivity!.execute!({ pageId: "pg001", sectionType: "activity_open_ended_answer", sectioningJson: JSON.stringify({ reasoning: "test", nodes: [{ nodeId: id, role: "activity_question", text: "New question" }] }), userInstructions: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("non-blank data-id") })
  expect(transport).not.toHaveBeenCalled()
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it.each(["", "   "])("rejects renderer-invented blank identity %j without publishing either entity", async id => {
  const transport = renderer("new-question", `<p data-id="${id}">Unexpected extra text</p>`)
  const before = storage.getNodeVersionFingerprint()
  const result = await tools.createTemplatedActivity!.execute!({ pageId: "pg001", sectionType: "activity_open_ended_answer", sectioningJson: JSON.stringify({ reasoning: "test", nodes: [{ nodeId: "new-question", role: "activity_question", text: "New question" }, { nodeId: "shared-image", role: "image" }] }), userInstructions: null }, {} as never)
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining(`Unknown data-id: "${id}"`) })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it.each(["", "   "])("preserves unchanged local legacy identity %j and its correction during an assistant edit", async id => {
  storage.putNodeData("web-rendering", "pg001", { sections: [rendered("pg001_sec001", id, "Legacy text")] })
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id, text: "Retained manual correction", source: "manual" }] })
  const history = storage.getAllNodeVersions("web-rendering", "pg001")
  const correction = storage.getLatestNodeData("text-catalog-translation", "fr")
  const result = await tools.updateSection!.execute!({ pageId: "pg001", sectionIndex: 0, html: `<section class="p-8"><p data-id="${id}">Legacy text</p></section>`, reasoning: "cosmetic edit", activityAnswers: null }, {} as never)
  expect(result).toMatchObject({ ok: true })
  expect(buildTextCatalogSnapshot(storage, storage.getPages()).entries.find(entry => entry.id === id)?.text).toBe("Legacy text")
  for (const row of history) expect(storage.getAllNodeVersions("web-rendering", "pg001")).toContainEqual(row)
  expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction)
})
