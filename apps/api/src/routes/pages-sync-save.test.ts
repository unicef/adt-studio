import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb, withBookWriter, writeSectioningLifecycle } from "@adt/storage"
import { loadBookConfig, packageAdtWeb, processFixedLayoutPages, readOutputCatalog, reconcileTextCatalog, stampGeneratedRendering } from "@adt/pipeline"
import type { OutputStatus, PageSectioningOutput, SectioningSynchronization, WebRenderingOutput } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createOutputRoutes } from "./outputs.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

const label = "atomic-sync"
const pageId = "pg001"
const sectionId = "pg001_sec009"
const textId = "pg001_t007"
const neighborId = "pg001_sec002"
const referencedPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=", "base64")
const untouchedHtml = `<section data-section-id="${neighborId}" data-section-type="activity_custom" class='authored'><p data-id="pg001_t002">Neighbor</p><script>const activity = { answer: "&<", version: 1 };</script></section>`
const activityHtml = `<section data-section-id="${sectionId}" data-section-type="activity_fill_in_the_blank" class='grid' style="color: #ABC"><div data-id="pg001_container"><p data-id="${textId}" aria-label="Keep &amp; label">Old [[blank:item-1]]</p><img data-id="pg001_im001" src="images/original.png?literal=1&amp;x=2" alt="Original" /></div><button data-id="${sectionId}__activity_gen_button">Check</button><script>const answers = { "item-1": "answer" }; window.activity = answers;</script></section>`
const originalSource: PageSectioningOutput = { reasoning: "Fixture with retained stable identities", sections: [
  { sectionId, sectionType: "activity_fill_in_the_blank", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false,
    nodes: [{ nodeId: "pg001_container", isPruned: false, children: [
      { nodeId: textId, role: "text", text: "Old ___", isPruned: false },
      { nodeId: "pg001_im001", role: "image", isPruned: false },
    ] }] },
  { sectionId: neighborId, sectionType: "activity_custom", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false,
    nodes: [{ nodeId: "pg001_t002", role: "text", text: "Neighbor", isPruned: false }] },
] }
// Reordered and deliberately sparse display indices expose positional matching.
const originalRendering: WebRenderingOutput = { sections: [
  { sectionIndex: 83, sectionType: "activity_custom", reasoning: "authored", html: untouchedHtml },
  { sectionIndex: 12, sectionType: "activity_fill_in_the_blank", reasoning: "generated", html: activityHtml, activityAnswers: { "item-1": "answer" } },
] }
let root: string
let configPath: string
const transport = vi.fn<typeof fetch>()
function storage() { return createBookStorage(label, root) }
function withStorage<T>(fn: (db: ReturnType<typeof storage>) => T): T {
  const db = storage()
  try { return fn(db) } finally { db.close() }
}
function appFor(bookRoot = root) {
  const app = new Hono()
  app.onError(errorHandler)
  app.route("/", createPageRoutes(bookRoot, path.resolve("prompts"), path.resolve("assets"), configPath))
  return app
}
async function get(bookRoot = root) {
  const response = await appFor(bookRoot).request(`/books/${label}/pages/${pageId}`)
  expect(response.status, await response.clone().text()).toBe(200)
  return await response.json() as { sectioningTree: PageSectioningOutput; rendering: WebRenderingOutput; versions: { sectioning: number; rendering: number }; sectioningSynchronization: SectioningSynchronization }
}
async function save(source: PageSectioningOutput, options: { baseVersion?: number; renderingVersion?: number; storyboard?: boolean; rendering?: WebRenderingOutput; renderingInSync?: boolean } = {}) {
  const { storyboard, rendering, renderingInSync, ...guards } = options
  return appFor().request(`/books/${label}/pages/${pageId}/${storyboard ? "storyboard" : "sectioning"}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(storyboard ? { sectioning: source, rendering, renderingInSync } : source), baseVersion: 1, renderingVersion: 1, ...guards }),
  })
}
function edited(text = "New ___") {
  const result = structuredClone(originalSource)
  result.sections[0].nodes[0].children![0].text = text
  return result
}
function rows(bookRoot = root) {
  const db = openBookDb(path.join(bookRoot, label, `${label}.db`))
  try {
    const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", []) as Array<{ name: string }>
    return Object.fromEntries(tables.map(({ name }) => [name, db.all(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`, [])]))
  } finally { db.close() }
}
function assets() {
  const files: Record<string, string> = {}
  function visit(folder: string) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (!/\.db(?:-|$)|\.book-writer/.test(entry.name)) files[path.relative(path.join(root, label), file)] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    }
  }
  visit(path.join(root, label))
  return files
}
function catalog() {
  return withStorage((db) => readOutputCatalog({ storage: db, config: loadBookConfig(label, root, configPath), bookDir: db.bookDir!, promptsDir: path.resolve("prompts"), configDir: path.resolve("config") }))
}
async function packaged() {
  const db = storage()
  try {
    await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en"], title: "Synchronization acceptance fixture", webAssetsDir: path.resolve("assets/adt"),
      config: loadBookConfig(label, root, configPath), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
    const folder = path.join(db.bookDir!, "adt")
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "content", "pages.json"), "utf8")) as Array<{ section_id: string; href: string }>
    return Object.fromEntries(manifest.map((item) => [item.section_id, fs.readFileSync(path.join(folder, item.href), "utf8")]))
  } finally { db.close() }
}
async function preview(id: string) {
  const app = new Hono()
  app.onError(errorHandler)
  app.route("/", createAdtPreviewRoutes(root, path.resolve("assets/adt"), configPath, path.resolve("prompts")))
  const result = await app.request(`/books/${label}/adt-preview/${id}.html`)
  expect(result.status, await result.clone().text()).toBe(200)
  return result.text()
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-atomic-sync-"))
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\noutput_languages: [en, fr]\n")
  withStorage((db) => {
    for (const [id, number] of [[pageId, 1], ["pg002", 2]] as const) db.putExtractedPage({ pageId: id, pageNumber: number, text: id,
      images: id === pageId ? [{ imageId: "pg001_im001", buffer: referencedPng, hash: crypto.createHash("sha256").update(referencedPng).digest("hex"), format: "png", width: 1, height: 1 }] : [],
      pageImage: { imageId: `${id}_page`, buffer: Buffer.from(`image-${id}`), hash: id, format: "png", width: 400, height: 600 } })
    db.putNodeData("metadata", "book", { language_code: "en" })
    db.putNodeData("page-sectioning", pageId, originalSource)
    db.putNodeData("web-rendering", pageId, stampGeneratedRendering(originalRendering, originalSource, pageId, 1))
    const neighbor: PageSectioningOutput = { reasoning: "other page", sections: [{ ...originalSource.sections[1], sectionId: "pg002_sec005", pageNumber: 2, nodes: [{ nodeId: "pg002_t003", role: "text", text: "Other page", isPruned: false }] }] }
    db.putNodeData("page-sectioning", "pg002", neighbor)
    db.putNodeData("web-rendering", "pg002", { sections: [{ sectionIndex: 0, sectionType: "activity_custom", reasoning: "Manual", html: '<section data-section-id="pg002_sec005" data-section-type="activity_custom"><p data-id="pg002_t003">Other page</p><script>custom()</script></section>' }] })
    db.putNodeData("text-catalog-translation", "fr", { generatedAt: "retained", entries: [{ id: textId, text: "Manuel", source: "manual" }, { id: "pg001_t002", text: "Voisin", source: "manual" }, { id: "pg002_t003", text: "Autre", source: "manual" }] })
    db.putNodeData("tts", "fr", { entries: [{ textId, language: "fr", fileName: "manual.mp3", source: "manual", provider: "manual", voice: "manual", model: "manual", cached: false }], generatedAt: "retained" })
    reconcileTextCatalog(db, { preserveRendering: true })
  })
  fs.writeFileSync(path.join(root, label, "images", "original.png"), referencedPng)
  fs.mkdirSync(path.join(root, label, "audio", "fr"), { recursive: true })
  fs.writeFileSync(path.join(root, label, "audio", "fr", "manual.mp3"), "immutable manual audio")
  transport.mockReset().mockRejectedValue(new Error("Save must not call a provider"))
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

describe("server-owned atomic synchronization Save", () => {
  it("patches a generated stable activity projection without transport calls, retaining every unrelated row and asset", async () => {
    const before = rows()
    const beforeAssets = assets()
    const result = await save(edited('New <img onerror="evil()"> & ___'))
    expect(result.status, await result.clone().text()).toBe(200)
    expect(await result.json()).toMatchObject({ sectioningVersion: 2, renderingVersion: 2, synchronization: { sections: expect.arrayContaining([expect.objectContaining({ sectionId, status: "text-patched" })]) } })
    const page = await get()
    expect(page.rendering.sections[1].html).toBe(activityHtml.replace("Old [[blank:item-1]]", 'New &lt;img onerror="evil()"&gt; &amp; [[blank:item-1]]'))
    expect(page.rendering.sections[0].html).toBe(untouchedHtml)
    expect(page.rendering.sections[1].activityAnswers).toEqual(originalRendering.sections[1].activityAnswers)
    expect(page.sectioningSynchronization.sections[0].status).toBe("current")
    const after = rows()
    for (const [table, value] of Object.entries(before)) {
      if (!["node_data", "node_current"].includes(table)) expect(after[table], table).toEqual(value)
    }
    const unaffected = (value: unknown) => (value as Array<{ node: string; item_id: string }>).filter((row) => row.item_id !== pageId && row.node !== "text-catalog")
    expect(unaffected(after.node_data)).toEqual(unaffected(before.node_data))
    expect(unaffected(after.node_current)).toEqual(unaffected(before.node_current))
    expect(assets()).toEqual(beforeAssets)
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(["web-rendering", "text-catalog"])("rolls back source, rendering, pointers and metadata when the %s write fails", async (node) => {
    const db = openBookDb(path.join(root, label, `${label}.db`))
    try { db.exec(`CREATE TRIGGER fail_sync_write BEFORE INSERT ON node_data WHEN NEW.node = '${node}' BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END;`) } finally { db.close() }
    const before = rows(), beforeAssets = assets()
    const result = await save(edited())
    expect(result.status).toBe(500)
    expect(rows()).toEqual(before)
    expect(assets()).toEqual(beforeAssets)
    expect((await get()).versions).toEqual(expect.objectContaining({ sectioning: 1, rendering: 1 }))
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(["unknown", "manual", "structural", "missing", "malformed"])("commits semantic edits and retains %s rendering with persistent actionable drift", async (kind) => {
    let source = edited()
    withStorage((db) => {
      const current = db.getLatestNodeData("web-rendering", pageId)!.data as WebRenderingOutput
      if (kind === "unknown") delete current.sections[1].generationEvidence
      if (kind === "manual") current.sections[1] = { ...current.sections[1], html: activityHtml.replace("Old", "Manual"), generationEvidence: { source: "manual" } }
      if (kind === "structural") source.sections[0].nodes[0].children!.push({ nodeId: "new-leaf", role: "text", text: "New leaf", isPruned: false })
      if (kind === "missing") current.sections = [current.sections[0]]
      if (kind === "malformed") current.sections[1].html = activityHtml.replace(/<\/section>$/, "")
      if (kind !== "structural") db.putNodeData("web-rendering", pageId, current)
    })
    const before = await get()
    const result = await save(source, { renderingVersion: before.versions.rendering })
    expect(result.status, await result.clone().text()).toBe(200)
    const committed = await result.json()
    expect(committed.sectioningVersion).toBe(2)
    expect(committed.renderingVersion).toBe(before.versions.rendering)
    const page = await get()
    expect(page.rendering).toEqual(before.rendering)
    const status = { unknown: "unknown-origin", manual: "protected-divergence", structural: "structural-drift", missing: "invalid-rendering", malformed: "invalid-rendering" }[kind]
    expect(page.sectioningSynchronization.sections.find((entry) => entry.sectionId === sectionId)).toMatchObject({ status, action: ["structural", "missing"].includes(kind) ? "repair" : "review" })
    expect((await get()).sectioningSynchronization).toEqual(page.sectioningSynchronization)
  })

  it("validates already-patched submitted pairs, writes once, and creates no versions on an identical repeat", async () => {
    const candidate = structuredClone(originalRendering)
    candidate.sections[1].html = activityHtml.replace("Old", "New")
    const first = await save(edited(), { storyboard: true, rendering: candidate, renderingInSync: true })
    expect(first.status, await first.clone().text()).toBe(200)
    expect(await first.json()).toMatchObject({ sectioningVersion: 2, renderingVersion: 2 })
    const afterFirst = rows()
    const repeat = await save(edited(), { storyboard: true, rendering: candidate, baseVersion: 2, renderingVersion: 2 })
    expect(repeat.status, await repeat.clone().text()).toBe(200)
    expect(await repeat.json()).toMatchObject({ sectioningVersion: 2, renderingVersion: 2 })
    expect(rows()).toEqual(afterFirst)
    withStorage((db) => { expect(db.getAllNodeVersions("page-sectioning", pageId)).toHaveLength(2); expect(db.getAllNodeVersions("web-rendering", pageId)).toHaveLength(2) })
  })

  it("commits compatible text and structural edits together while patching only the proven section", async () => {
    const source = edited()
    source.sections[1].nodes.push({ nodeId: "new-custom-leaf", role: "text", text: "Custom addition", isPruned: false })
    const before = await get()
    const response = await save(source)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sectioningVersion: 2, renderingVersion: 2, synchronization: { sections: [
      { sectionId, status: "text-patched" }, { sectionId: neighborId, status: "structural-drift", action: "review" },
    ] } })
    const current = await get()
    expect(current.rendering.sections[0]).toEqual(before.rendering.sections[0])
    expect(current.rendering.sections[1].html).toBe(activityHtml.replace("Old", "New"))
    expect(current.sectioningSynchronization.sections).toEqual([
      expect.objectContaining({ sectionId, status: "current" }),
      expect.objectContaining({ sectionId: neighborId, status: "structural-drift", action: "review" }),
    ])
    expect(transport).not.toHaveBeenCalled()
  })

  it("does not trust client currentness or forged generated-origin metadata", async () => {
    const candidate = structuredClone(originalRendering)
    candidate.sections[1].html = activityHtml.replace("Old", "Manual override")
    candidate.sections[1].generationEvidence = stampGeneratedRendering(candidate, edited(), pageId, 2).sections[1].generationEvidence
    const response = await save(edited(), { storyboard: true, rendering: candidate, renderingInSync: true })
    expect(response.status).toBe(200)
    const page = await get()
    expect(page.rendering.sections[1].html).toContain("Manual override")
    expect(page.rendering.sections[1].generationEvidence).toEqual({ source: "manual" })
    expect(page.sectioningSynchronization.sections[0]).toMatchObject({ status: "protected-divergence", action: "review" })
  })

  it("keeps explicitly reviewed unknown output current only for those exact inputs without granting generated authorship", async () => {
    writeSectioningLifecycle(path.join(root, label), "dynamic", true, false)
    withStorage((db) => db.putNodeData("web-rendering", pageId, originalRendering))
    const app = new Hono()
    app.onError(errorHandler)
    app.use("/books/:label/*", bookWriterMiddleware(root))
    app.route("/", createOutputRoutes(root, path.resolve("prompts"), configPath))
    const outputsResponse = await app.request(`/books/${label}/outputs`)
    expect(outputsResponse.status, await outputsResponse.clone().text()).toBe(200)
    const { outputs } = await outputsResponse.json() as { outputs: OutputStatus[] }
    const output = outputs.find((entry) => entry.identity.kind === "storyboard" && entry.identity.id === pageId)!
    expect(output).toMatchObject({ protected: true, usable: true })
    const review = { identity: output.identity, signature: output.signature, contentHash: output.contentHash, action: "keep" }
    const reviewed = await app.request(`/books/${label}/outputs/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review) })
    expect(reviewed.status, await reviewed.clone().text()).toBe(200)
    const page = await get()
    expect(page.sectioningSynchronization.sections[0]).toMatchObject({ sectionId, status: "current", action: "none" })
    expect(page.rendering.sections[1].generationEvidence?.source).toBeUndefined()
    expect(page.rendering.sections[1].generationEvidence?.review?.action).toBe("keep")
    const response = await save(edited(), { renderingVersion: page.versions.rendering })
    expect(response.status).toBe(200)
    const changed = await get()
    expect(changed.rendering.sections[1].html).toBe(activityHtml)
    expect(changed.rendering.sections[1].generationEvidence?.source).toBeUndefined()
    expect(changed.sectioningSynchronization.sections[0]).toMatchObject({ sectionId, status: "unknown-origin", action: "review" })
    expect(transport).not.toHaveBeenCalled()
  })

  it.each([{ baseVersion: 0 }, { renderingVersion: 0 }])("rejects stale guards %j without changing rows", async (guards) => {
    const before = rows()
    expect((await save(edited(), guards)).status).toBe(409)
    expect(rows()).toEqual(before)
  })

  it.each(["baseVersion", "renderingVersion"])("rejects missing %s rather than guessing an editor's snapshot", async (field) => {
    const request = { ...edited(), baseVersion: 1, renderingVersion: 1 } as Record<string, unknown>
    delete request[field]
    const before = rows()
    const response = await appFor().request(`/books/${label}/pages/${pageId}/sectioning`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) })
    expect(response.status).toBe(400)
    expect(rows()).toEqual(before)
  })

  it("serializes overlapping editors without losing either committed output or the rejected draft", async () => {
    const first = edited("First ___"), second = edited("Second ___")
    const results = await Promise.all([save(first), save(second)])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const page = await get()
    const winner = results[0].status === 200 ? "First" : "Second"
    expect(page.rendering.sections[1].html).toContain(`${winner} [[blank:item-1]]`)
    expect(page.sectioningTree.sections[0].nodes[0].children![0].text).toBe(`${winner} ___`)
    expect(first.sections[0].nodes[0].children![0].text).toBe("First ___")
    expect(second.sections[0].nodes[0].children![0].text).toBe("Second ___")
    withStorage((db) => { expect(db.getAllNodeVersions("page-sectioning", pageId)).toHaveLength(2); expect(db.getAllNodeVersions("web-rendering", pageId)).toHaveLength(2) })
  })

  it("rejects an ambiguous duplicate using stale versions, then allows a no-op retry after authoritative reload", async () => {
    expect((await save(edited())).status).toBe(200)
    const committed = rows()
    expect((await save(edited())).status).toBe(409)
    expect(rows()).toEqual(committed)
    const page = await get()
    expect((await save(edited(), { baseVersion: page.versions.sectioning, renderingVersion: page.versions.rendering })).status).toBe(200)
    expect(rows()).toEqual(committed)
  })

  it("rejects active tasks and competing writer admission before any writes", async () => {
    withStorage((db) => db.markStepStarted("web-rendering"))
    const before = rows()
    expect((await save(edited())).status).toBe(409)
    expect(rows()).toEqual(before)
    let release!: () => void
    let entered!: () => void
    const ready = new Promise<void>((resolve) => { entered = resolve })
    const held = withBookWriter(path.join(root, label), async () => { entered(); await new Promise<void>((resolve) => { release = resolve }) })
    await ready
    try {
      const result = await save(edited())
      expect(result.status).toBe(409)
      expect(await result.json()).toMatchObject({ code: "BOOK_BUSY" })
      expect(rows()).toEqual(before)
    } finally { release(); await held }
  })

  it("refuses positional reassignment when a stable section belongs to two active pages", async () => {
    withStorage((db) => db.putNodeData("page-sectioning", "pg002", originalSource))
    const before = (await get()).rendering
    const response = await save(edited())
    expect(response.status).toBe(200)
    expect((await get()).rendering).toEqual(before)
    expect((await get()).sectioningSynchronization.sections[0]).toMatchObject({ status: "unknown-origin", action: "review" })
  })

  it("read-only drift survives reopened handles, directory import and historical restore without new versions", async () => {
    withStorage((db) => db.putNodeData("page-sectioning", pageId, edited()))
    const before = rows()
    const page = await get()
    expect(page.sectioningSynchronization.sections[0]).toMatchObject({ status: "text-drift", action: "repair" })
    expect((await get()).sectioningSynchronization).toEqual(page.sectioningSynchronization)
    expect(rows()).toEqual(before)
    const imported = path.join(root, "imported")
    fs.mkdirSync(imported)
    fs.cpSync(path.join(root, label), path.join(imported, label), { recursive: true })
    expect((await get(imported)).sectioningSynchronization).toEqual(page.sectioningSynchronization)
    expect(rows(imported)).toEqual(before)
    withStorage((db) => db.setCurrentNodeVersion("page-sectioning", pageId, 1))
    const restored = rows()
    expect((await get()).sectioningSynchronization.sections[0].status).toBe("current")
    expect(rows()).toEqual(restored)
  })

  it("keeps retired sections distinct from successors that reuse display indices", async () => {
    const source = edited()
    source.sections[0].sectionId = "pg001_sec010"
    const response = await save(source)
    expect(response.status).toBe(200)
    const page = await get()
    expect(page.rendering.sections[1].html).toBe(activityHtml)
    expect(page.sectioningSynchronization.sections).toContainEqual(expect.objectContaining({ sectionId: "pg001_sec010", status: "invalid-rendering" }))
    expect(page.sectioningSynchronization.sections.find((entry) => entry.sectionId === sectionId)?.action).not.toBe("repair")
    expect(page.rendering.sections[1].sectionIndex).toBe(12)
  })

  it("invalidates only consuming output signatures while retaining manual downstream histories and physical media", async () => {
    const before = catalog()
    const retained = withStorage((db) => ({ translation: db.getAllNodeVersions("text-catalog-translation", "fr"), speech: db.getAllNodeVersions("tts", "fr") }))
    const media = assets()
    expect((await save(edited())).status).toBe(200)
    const after = catalog()
    const translated = (items: typeof before, id: string) => items.find((entry) => entry.identity.kind === "translation" && entry.identity.id === id && entry.identity.language === "fr")!
    expect(translated(after, textId).signature).not.toBe(translated(before, textId).signature)
    expect(translated(after, textId)).toMatchObject({ text: "Manuel", protected: true, manual: true })
    expect(translated(after, "pg001_t002")).toEqual(translated(before, "pg001_t002"))
    expect(translated(after, "pg002_t003")).toEqual(translated(before, "pg002_t003"))
    expect(withStorage((db) => ({ translation: db.getAllNodeVersions("text-catalog-translation", "fr"), speech: db.getAllNodeVersions("tts", "fr") }))).toEqual(retained)
    expect(assets()).toEqual(media)
  })

  it("serves and packages the same updated sparse stable activity projection shown in the editor", async () => {
    writeSectioningLifecycle(path.join(root, label), "dynamic", true, false)
    expect((await save(edited())).status).toBe(200)
    const editor = await get()
    const previewHtml = await preview(sectionId)
    const output = await packaged()
    expect(previewHtml).toContain("New [[blank:item-1]]")
    expect(output[sectionId]).toContain("New [[blank:item-1]]")
    const activityScript = 'const answers = { "item-1": "answer" }; window.activity = answers;'
    expect(editor.rendering.sections[1].html).toContain(activityScript)
    expect(previewHtml).toContain(activityScript)
    expect(output[sectionId]).toContain(activityScript)
    expect(output[neighborId]).toContain('const activity = { answer: "&<", version: 1 };')
    expect(output["pg002_sec005"]).toContain("Other page")
  })

  it("allows fixed-layout semantic edits while retaining genuine positioned editor, preview and packaged output", async () => {
    fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
    writeSectioningLifecycle(path.join(root, label), "dynamic", true, false)
    withStorage((db) => {
      db.putNodeData("positioned-text", pageId, { pageWidth: 400, pageHeight: 600, drawItems: [{ kind: "paragraph", textId: "pg001_positioned001", top: 110, left: 72, lineHeight: 24,
        text: "Positioned original", segments: [{ text: "Positioned original", style: { color: "#111111", "font-size": "18px" } }] }] })
      processFixedLayoutPages(db, "images/", [pageId])
    })
    const before = await get()
    const positioned = withStorage((db) => db.getAllNodeVersions("fixed-layout-sectioning", pageId))
    const beforePreview = await preview("pg001_sec001")
    const beforePackage = await packaged()
    const response = await save(edited("Semantic only ___"), { renderingVersion: before.versions.rendering })
    expect(response.status, await response.clone().text()).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ sectioningVersion: 2, renderingVersion: before.versions.rendering })
    expect(result.synchronization.sections.filter((section: { sectionId: string }) => [sectionId, neighborId].includes(section.sectionId))).toEqual([
      expect.objectContaining({ sectionId, status: "fixed-layout-unmapped", action: "none" }),
      expect.objectContaining({ sectionId: neighborId, status: "fixed-layout-unmapped", action: "none" }),
    ])
    const current = await get()
    expect(current.rendering).toEqual(before.rendering)
    expect(current.sectioningTree.sections[0].nodes[0].children![0].text).toBe("Semantic only ___")
    expect(withStorage((db) => db.getAllNodeVersions("fixed-layout-sectioning", pageId))).toEqual(positioned)
    const afterPreview = await preview("pg001_sec001")
    const afterPackage = await packaged()
    for (const html of [beforePreview, afterPreview, beforePackage.pg001_sec001, afterPackage.pg001_sec001]) {
      expect(html).toContain("Positioned original")
      expect(html).not.toContain("Semantic only")
    }
    expect(afterPackage.pg001_sec001).toBe(beforePackage.pg001_sec001)
  })
  it("rejects submitted duplicate identities atomically without blessing a client sync flag", async () => {
    const before = rows()
    const rendering = structuredClone(originalRendering)
    rendering.sections[0].html = rendering.sections[1].html
    const response = await save(edited(), { storyboard: true, rendering, renderingInSync: true })
    expect(response.status).toBe(400)
    expect(rows()).toEqual(before)
  })

  it("keeps the positioned boundary on GET after config switches to reflowable", async () => {
    withStorage((db) => {
      db.putNodeData("positioned-text", pageId, { pageWidth: 400, pageHeight: 600, drawItems: [{ kind: "paragraph", textId: "pg001_positioned001", top: 110, left: 72, lineHeight: 24, text: "Positioned original", segments: [{ text: "Positioned original", style: { color: "#111111", "font-size": "18px" } }] }] })
      processFixedLayoutPages(db, "images/", [pageId])
    })
    const before = rows()
    const result = await get()
    expect(result.sectioningSynchronization.layout).toBe("fixed")
    expect(result.sectioningSynchronization.sections.find((s) => s.sectionId === sectionId)).toMatchObject({ status: "fixed-layout-unmapped", action: "none" })
    expect(rows()).toEqual(before)
  })

  it.each(["pruned", "legacy"])("allows an authored edit while preserving an unchanged %s sibling", async (kind) => {
    const source = structuredClone(originalSource)
    const rendering = structuredClone(originalRendering)
    if (kind === "pruned") source.sections[1].isPruned = true
    else rendering.sections[0].html = "<section><p>Legacy unknown sibling</p></section>"
    withStorage((db) => {
      db.putNodeData("page-sectioning", pageId, source)
      db.putNodeData("web-rendering", pageId, rendering)
    })
    rendering.sections[1].html = rendering.sections[1].html.replace("class='grid'", "class='authored-grid'")
    const response = await save(source, { storyboard: true, rendering, baseVersion: 2, renderingVersion: 2 })
    expect(response.status, await response.clone().text()).toBe(200)
    const page = await get()
    expect(page.rendering.sections[0]).toEqual(rendering.sections[0])
    expect(page.rendering.sections[1].html).toContain("class='authored-grid'")
  })

})
