import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { reconcileSectioningIdentities, reconcileTextCatalog, buildTextCatalogSnapshot, buildEasyReadSourceBlocks } from "@adt/pipeline"
import { type PageSectioningOutput, type WebRenderingOutput, type GlossaryOutput, type TextCatalogOutput, type OutputStatus } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { createGlossaryRoutes } from "./glossary.js"
import { createOutputRoutes } from "./outputs.js"
import { createTextCatalogRoutes } from "./text-catalog.js"
import { createStageRunner } from "../services/stage-runner.js"
import { makeBeforeRun } from "./stages.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
let app: Hono
const label = "review"
const db = () => createBookStorage(label, root)
const tree = (texts: string[]): PageSectioningOutput => ({ reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: texts.map((text, i) => ({ nodeId: `pg001_n${String(i + 1).padStart(4, "0")}`, role: "body_text", text, isPruned: false })) }] })
const rendered = (sectioning: PageSectioningOutput): WebRenderingOutput => ({ sections: sectioning.sections.map((section, sectionIndex) => ({ sectionIndex, sectionId: section.sectionId, sectionType: "text", reasoning: "", html: `<section data-section-id='${section.sectionId}'>${section.nodes.map((node) => `<p data-id='${node.nodeId}'>${node.text}</p>`).join("")}</section>` })) })
const send = (route: string, body: unknown, method = "PUT") => app.request(`/books/${label}/${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spec1-review-"))
  const storage = db()
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Alpha Beta", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("page-sectioning", "pg001", tree(["Alpha", "Beta"]))
  storage.putNodeData("web-rendering", "pg001", rendered(tree(["Alpha", "Beta"])))
  reconcileTextCatalog(storage)
  fs.writeFileSync(path.join(storage.bookDir!, "config.yaml"), "output_languages: [en, fr]\n")
  storage.close()
  app = new Hono().route("/", createPageRoutes(root, path.resolve("prompts"), path.resolve("assets")))
    .route("/", createGlossaryRoutes(root)).route("/", createOutputRoutes(root, path.resolve("prompts")))
    .route("/", createTextCatalogRoutes(root, path.resolve("prompts")))
  app.onError(errorHandler)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("resection preserves the restored source's identities and reserves retired IDs", () => {
  let storage = db()
  const original = storage.getLatestNodeData("page-sectioning", "pg001")!
  const retired = tree(["Alpha", "Beta"])
  retired.sections[0].sectionId = "pg001_sec002"
  retired.sections[0].nodes[0].nodeId = "pg001_n0003"
  storage.putNodeData("page-sectioning", "pg001", retired)
  storage.setCurrentNodeVersion("page-sectioning", "pg001", original.version)
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_n0001", text: "Active correction", source: "manual" }, { id: "pg001_n0003", text: "Retired correction", source: "manual" }], generatedAt: "before" })
  const manual = storage.getLatestNodeData("text-catalog-translation", "fr")
  storage.close()
  makeBeforeRun(label, "sectioning", "sectioning", root)()
  storage = db()
  try {
    expect(storage.getLatestNodeData("page-sectioning", "pg001")).toEqual(original)
    const next = reconcileSectioningIdentities(storage, "pg001", tree(["Inserted", "Alpha", "Beta"]))
    expect(next.sections[0].nodes.map((node) => node.nodeId)).toEqual(["pg001_n0004", "pg001_n0001", "pg001_n0002"])
    expect(next.sections[0].sectionId).toBe("pg001_sec003")
    storage.putNodeData("page-sectioning", "pg001", next)
    storage.putNodeData("web-rendering", "pg001", rendered(next))
    expect(buildTextCatalogSnapshot(storage, storage.getPages()).entries.find((entry) => entry.id === "pg001_n0001")?.text).toBe("Alpha")
    expect(storage.getLatestNodeData("text-catalog-translation", "fr")).toEqual(manual)
  } finally { storage.close() }
})

it("rejects structural edits on contradictory owners without changing any version", async () => {
  const storage = db()
  const data = tree(["Alpha", "Beta"])
  data.sections.push({ ...data.sections[0], sectionId: "pg001_sec002", nodes: [] })
  const conflicting = rendered(data)
  conflicting.sections[0].sectionId = data.sections[1].sectionId
  storage.putNodeData("web-rendering", "pg001", conflicting)
  storage.putNodeData("page-sectioning", "pg001", { ...data, sections: [...data.sections].reverse() })
  const before = storage.getNodeVersionFingerprint([])
  storage.close()
  expect((await send("pages/pg001/sections/0/clone", {}, "POST")).status).toBe(409)
  const reopened = db()
  expect(reopened.getNodeVersionFingerprint([])).toEqual(before)
  reopened.close()
})

it("clones catalog identities while preserving local DOM and activity answer references", async () => {
  const storage = db()
  const html = rendered(tree(["Alpha", "Beta"]))
  html.sections[0].html = html.sections[0].html.replace("</section>", "<p data-id='generated-leaf' id='generated-leaf'>Choose</p><label for='generated-leaf'>Answer</label><input data-cell='cell-1' data-answer='generated-leaf' aria-label='generated-leaf'/><div data-activity-item='generated-leaf'></div><div data-id='fallback-target' data-correct-items='item-1,item-2'></div><div class='dropzone-slot' id='target-A' data-id='target-A'></div><div data-activity-target='target-1' data-correct-items='generated-leaf'></div><img data-id='shared-image'/></section>")
  html.sections[0].activityAnswers = { "item-1": "target-A", "fallback-target": "item-1,item-2" }
  storage.putNodeData("web-rendering", "pg001", html)
  storage.close()
  expect((await send("pages/pg001/sections/0/clone", {}, "POST")).status).toBe(200)
  const reopened = db()
  const next = reopened.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput
  expect(next.sections[0].html).toBe(html.sections[0].html)
  expect(next.sections[1].html).not.toContain('data-id="generated-leaf"')
  expect(next.sections[1].html).toContain('for="generated-leaf"')
  expect(next.sections[1].html).toContain('id="generated-leaf"')
  expect(next.sections[1].html).toContain('data-answer="generated-leaf"')
  expect(next.sections[1].html).toContain('aria-label="generated-leaf"')
  expect(next.sections[1].html).toContain('data-activity-item="generated-leaf"')
  expect(next.sections[1].html).toContain('data-correct-items="generated-leaf"')
  expect(next.sections[1].html).toContain('data-activity-target="fallback-target"')
  expect(next.sections[1].html).not.toContain('data-id="fallback-target"')
  expect(next.sections[1].html).toContain('id="target-A"')
  expect(next.sections[1].html).not.toContain('data-id="target-A"')
  expect(next.sections[1].activityAnswers).toEqual(html.sections[0].activityAnswers)
  expect(next.sections[1].html).not.toContain("pg001_n0001")
  expect(next.sections[1].html).toContain(`data-section-id="${next.sections[1].sectionId}"`)
  expect(next.sections[1].html).toContain('data-id="shared-image"')
  const entries = buildTextCatalogSnapshot(reopened, reopened.getPages()).entries
  expect(entries.filter((entry) => entry.text === "Choose").map((entry) => entry.id)).toHaveLength(2)
  reopened.close()
})

it("materializes legacy glossary IDs once and retains the second term identity after deletion", async () => {
  const storage = db()
  const glossary = { items: ["Forest", "River"].map((word) => ({ word, definition: word + " definition", variations: [], emojis: [] })), pageCount: 1, generatedAt: "before" }
  storage.putNodeData("glossary", "book", glossary)
  storage.close()
  const first = await (await app.request(`/books/${label}/glossary`)).json()
  const second = await (await app.request(`/books/${label}/glossary`)).json()
  expect(second.version).toBe(first.version)
  expect(first.items.map((item: { id: string }) => item.id)).toEqual(["gl001", "gl002"])
  expect((await send("glossary", { ...glossary, items: glossary.items.slice(1) })).status).toBe(200)
  const reopened = db()
  expect((reopened.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items[0].id).toBe("gl002")
  reopened.close()
})

it("keeps first-copy translation display consistent and cannot accept away source conflicts", async () => {
  const storage = db()
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_n0001", text: "First", source: "manual" }, { id: "pg001_n0001", text: "Hidden", source: "manual" }], generatedAt: "before" })
  storage.close()
  const projection = await (await app.request(`/books/${label}/outputs`)).json()
  const output = projection.outputs.find((item: OutputStatus) => item.identity.kind === "translation" && item.identity.id === "pg001_n0001")
  expect(output).toMatchObject({ text: "First", protected: true, current: false, warnings: expect.arrayContaining([{ reason: "output-conflict", conflictId: "pg001_n0001" }]) })
  expect((await send("outputs/review", { identity: output.identity, signature: output.signature, contentHash: output.contentHash, action: "keep" }, "POST")).status).toBe(409)
  const catalog = await (await app.request(`/books/${label}/text-catalog`)).json()
  const translation = catalog.translations.fr
  expect((await send("text-catalog-translation/fr", { entries: [{ id: "pg001_n0001", text: "First" }], baseVersion: translation.version, sourceVersion: catalog.version, sourceSignature: translation.sourceSignature })).status).toBe(200)
  const reopened = db()
  expect((reopened.getLatestNodeData("text-catalog-translation", "fr")!.data as TextCatalogOutput).entries.map((entry) => entry.text)).toEqual(["First", "Hidden"])
  reopened.close()
})


it.each([false, true])("reserves first-copy glossary ownership across legacy collisions (explicit duplicate: %s)", async (explicitDuplicate) => {
  const storage = db()
  const glossary = {
    items: [
      { id: "gl002", word: "Forest", definition: "Trees", variations: [], emojis: [] },
      { ...(explicitDuplicate ? { id: "gl002" } : {}), word: "River", definition: "Water", variations: [], emojis: [] },
    ], pageCount: 1, generatedAt: "before",
  }
  storage.putNodeData("glossary", "book", glossary)
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "gl002_word", text: "Foret", source: "manual" }], generatedAt: "before" })
  const translation = storage.getLatestNodeData("text-catalog-translation", "fr")
  storage.close()
  const materialized = await (await app.request(`/books/${label}/glossary`)).json()
  const riverId = materialized.items[1].id
  expect(materialized.items[0].id).toBe("gl002")
  expect(riverId).not.toBe("gl002")
  // Simulate a client that opened its editor before the GET migration.
  expect((await send("glossary", { ...glossary, items: glossary.items.slice(1) })).status).toBe(200)
  const reopened = db()
  expect((reopened.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items[0]).toMatchObject({ id: riverId, word: "River" })
  expect(reopened.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translation)
  expect(buildTextCatalogSnapshot(reopened, reopened.getPages()).entries.filter((entry) => entry.id.startsWith("gl002"))).toEqual([])
  reopened.close()
})

it.each([false, true])("preserves same-word legacy glossary ownership before or after migration (%s)", async (readFirst) => {
  const storage = db()
  const items = [
    { id: "gl001", word: "Bank", definition: "Financial institution", variations: [], emojis: [] },
    { id: "gl001", word: "Bank", definition: "River edge", variations: [], emojis: [] },
  ]
  const glossary = { items, pageCount: 1, generatedAt: "before" }
  storage.putNodeData("glossary", "book", glossary)
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "gl001", text: "Banque", source: "manual" }], generatedAt: "before" })
  const translation = storage.getLatestNodeData("text-catalog-translation", "fr")
  storage.close()
  if (readFirst) await app.request(`/books/${label}/glossary`)
  expect((await send("glossary", { ...glossary, items: [items[1]] })).status).toBe(200)
  const reopened = db()
  const kept = (reopened.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items[0]
  expect(kept).toMatchObject({ id: "gl002", definition: "River edge" })
  expect(reopened.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translation)
  expect(buildTextCatalogSnapshot(reopened, reopened.getPages()).entries.some((entry) => entry.id === "gl001")).toBe(false)
  reopened.close()
})

it("keeps verified migrated IDs on rename and rejects stale glossary versions without writes", async () => {
  const storage = db()
  const item = { id: "gl001", word: "Bank", definition: "Financial", variations: [], emojis: [] }
  storage.putNodeData("glossary", "book", { items: [item, { ...item, definition: "River edge" }], pageCount: 1, generatedAt: "before" })
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "gl001_def", text: "Banque", source: "manual" }], generatedAt: "before" })
  const translation = storage.getLatestNodeData("text-catalog-translation", "fr")
  storage.close()
  const current = await (await app.request(`/books/${label}/glossary`)).json()
  const edited = { ...current, items: current.items.map((entry: { id: string }) => entry.id === "gl001" ? { ...entry, word: "Finance" } : entry) }
  expect((await send("glossary", edited)).status).toBe(200)
  let after = db()
  expect((after.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items[0]).toMatchObject({ id: "gl001", word: "Finance" })
  expect(after.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translation)
  const fingerprint = after.getNodeVersionFingerprint([])
  after.close()
  expect((await send("glossary", current)).status).toBe(409)
  after = db()
  expect(after.getNodeVersionFingerprint([])).toEqual(fingerprint)
  after.close()
})

it("allocates ambiguous legacy edits a fresh ID but preserves trustworthy modern IDs through word swaps", async () => {
  const storage = db()
  const item = { id: "gl001", word: "Bank", definition: "Same", variations: [], emojis: [] }
  const glossary = { items: [item, item], pageCount: 1, generatedAt: "before" }
  storage.putNodeData("glossary", "book", glossary)
  storage.close()
  expect((await send("glossary", { ...glossary, items: [{ ...item, definition: "Edited" }] })).status).toBe(200)
  const reopened = db()
  expect((reopened.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items[0].id).toBe("gl003")
  reopened.putNodeData("glossary", "book", { ...glossary, items: [{ ...item, id: "modern1", word: "Forest" }, { ...item, id: "modern2", word: "River" }] })
  reopened.close()
  const swapped = [{ ...item, id: "modern1", word: "River" }, { ...item, id: "modern2", word: "Forest" }]
  expect((await send("glossary", { ...glossary, items: swapped })).status).toBe(200)
  const after = db()
  expect((after.getLatestNodeData("glossary", "book")!.data as GlossaryOutput).items).toEqual(swapped)
  after.close()
})

it("allows role-only changes and fewer copies of existing source and image-alt conflicts, but rejects new values atomically", async () => {
  const transport = vi.fn(() => { throw new Error("Save must not call a provider") })
  vi.stubGlobal("fetch", transport)
  const storage = db()
  const source = rendered(tree(["Alpha", "Beta"]))
  source.sections[0].html = `<section data-section-id="pg001_sec001"><p data-id="shared">First</p><p data-id="shared">Second</p><p data-id="shared">Second</p><img data-id="picture" alt="First alt"/><img data-id="picture" alt="Second alt"/><img data-id="picture" alt="Second alt"/></section>`
  storage.putNodeData("web-rendering", "pg001", source)
  storage.close()
  const cleanup = structuredClone(source)
  cleanup.sections[0].html = source.sections[0].html
    .replace('<p data-id="shared">First</p>', '<h2 data-id="shared">First</h2>')
    .replace('<p data-id="shared">Second</p>', '')
    .replace('<img data-id="picture" alt="Second alt"/>', '')
  expect((await send("pages/pg001/rendering", cleanup)).status).toBe(200)
  const before = db()
  const fingerprint = before.getNodeVersionFingerprint([])
  before.close()
  for (const [oldValue, newValue] of [["Second</p>", "Third</p>"], ["Second alt", "Third alt"]]) {
    const changed = structuredClone(cleanup)
    changed.sections[0].html = changed.sections[0].html.replace(oldValue, newValue)
    expect((await send("pages/pg001/rendering", changed)).status).toBe(409)
    const reopened = db()
    expect(reopened.getNodeVersionFingerprint([])).toEqual(fingerprint)
    reopened.close()
  }
  expect(transport).not.toHaveBeenCalled()
})

it("migrates repeated legacy activity IDs only on the saved page", async () => {
  const storage = db()
  const legacy = rendered(tree(["Alpha", "Beta"]))
  legacy.sections[0].html = `<section data-section-id="pg001_sec001"><p data-id="activity_gen_1">Choose</p><p data-id="activity_gen_1">Choose</p></section>`
  storage.putNodeData("web-rendering", "pg001", legacy)
  storage.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "", pageImage: { imageId: "pg002_page", buffer: Buffer.from("page2"), format: "png", hash: "page2", width: 100, height: 100 }, images: [] })
  const otherSource = tree(["Other"])
  otherSource.sections[0].sectionId = "pg002_sec001"
  storage.putNodeData("page-sectioning", "pg002", otherSource)
  const other = structuredClone(legacy)
  other.sections[0].sectionId = "pg002_sec001"
  other.sections[0].html = other.sections[0].html.replace("pg001_sec001", "pg002_sec001")
  storage.putNodeData("web-rendering", "pg002", other)
  const previousOther = storage.getLatestNodeData("web-rendering", "pg002")
  storage.close()
  expect((await send("pages/pg001/rendering", legacy)).status).toBe(200)
  const reopened = db()
  const saved = reopened.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput
  expect(saved.sections[0].html.match(/data-id="pg001_sec001__activity_gen_1"/g)).toHaveLength(2)
  expect(reopened.getLatestNodeData("web-rendering", "pg002")).toEqual(previousOther)
  reopened.close()
})

it("keeping a manual translation does not certify a conflicting source", async () => {
  const storage = db()
  const source = rendered(tree(["Alpha", "Beta"]))
  source.sections[0].html += '<p data-id="pg001_n0001">Conflicting copy</p>'
  storage.putNodeData("web-rendering", "pg001", source)
  storage.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_n0001", text: "Correction", source: "manual" }], generatedAt: "before" })
  storage.close()
  const read = async () => (await (await app.request(`/books/${label}/outputs`)).json()).outputs.find((item: OutputStatus) => item.identity.kind === "translation" && item.identity.id === "pg001_n0001")
  const output = await read()
  expect((await send("outputs/review", { identity: output.identity, signature: output.signature, contentHash: output.contentHash, action: "keep" }, "POST")).status).toBe(200)
  expect(await read()).toMatchObject({ current: false, text: "Correction", warnings: expect.arrayContaining([{ reason: "source-conflict", conflictId: "pg001_n0001" }]) })
})

it("rolls back a structural clone when its later rendering publication fails", async () => {
  const storage = db()
  const before = storage.getNodeVersionFingerprint([])
  storage.close()
  const sql = openBookDb(path.join(root, label, `${label}.db`))
  sql.exec(`CREATE TRIGGER reject_clone_rendering BEFORE INSERT ON node_data WHEN NEW.node = 'web-rendering' BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END`)
  sql.close()
  expect((await send("pages/pg001/sections/0/clone", {}, "POST")).status).toBe(500)
  const reopened = db()
  expect(reopened.getNodeVersionFingerprint([])).toEqual(before)
  reopened.close()
})


it.each(["translation", "easy-read"] as const)("rejects a stale %s replacement when a hidden retained copy changed", async (kind) => {
  const storage = db()
  fs.appendFileSync(path.join(storage.bookDir!, "config.yaml"), "easy_read:\n  enabled: true\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\n")
  const node = kind === "translation" ? "text-catalog-translation" : "easy-read"
  const itemId = kind === "translation" ? "fr" : "book"
  let value: unknown
  if (kind === "translation") value = { entries: [{ id: "pg001_n0001", text: "Visible", source: "manual" }, { id: "pg001_n0001", text: "Hidden", source: "manual" }], generatedAt: "before" }
  else {
    const blocks = buildEasyReadSourceBlocks(storage, storage.getPages())
    blocks[0].entries = blocks[0].entries.slice(0, 1).map((entry) => ({ ...entry, text: "Visible", source: "manual" }))
    blocks.push({ ...blocks[0], sectionId: "retired-owner", entries: blocks[0].entries.map((entry) => ({ ...entry, text: "Hidden" })) })
    value = { blocks, generatedAt: "before" }
  }
  storage.putNodeData(node, itemId, value)
  storage.close()
  const read = async () => (await (await app.request(`/books/${label}/outputs`)).json()).outputs.find((item: OutputStatus) => item.identity.kind === kind && item.text === "Visible") as OutputStatus
  const before = await read()
  const updated = db()
  updated.putNodeData(node, itemId, JSON.parse(JSON.stringify(value).replace('"Hidden"', '"New hidden correction"')))
  const protectedVersion = updated.getLatestNodeData(node, itemId)
  updated.close()
  const after = await read()
  expect(after.text).toBe(before.text)
  expect(after.signature).toBe(before.signature)
  expect(after.contentHash).not.toBe(before.contentHash)
  const transport = vi.fn(() => { throw new Error("A stale replacement must not call a provider") })
  vi.stubGlobal("fetch", transport)
  const stage = kind === "translation" ? "translate" : "easy-read"
  await expect(createStageRunner().run(label, {
    booksDir: root, promptsDir: path.resolve("prompts"), fromStage: stage, toStage: stage,
    credentials: { openai: { apiKey: "stub" } },
    outputScope: { selection: { identities: [before.identity] }, replace: [{ identity: before.identity, signature: before.signature, contentHash: before.contentHash }] },
  }, { emit() {} })).rejects.toThrow(/changed|conflict/i)
  const reopened = db()
  expect(reopened.getLatestNodeData(node, itemId)).toEqual(protectedVersion)
  reopened.close()
  expect(transport).not.toHaveBeenCalled()
})
