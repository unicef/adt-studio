import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage, withBookWriter, storeImmutableAsset, publishSpeechOutput, restoreSpeechOutput } from "@adt/storage"
import { outputEvidence, reconcileTextCatalog, packageAdtWeb, computePackagingInputHash, loadBookConfig } from "@adt/pipeline"
import type { OutputStatus, TextCatalogOutput } from "@adt/types"
import { createOutputRoutes } from "./outputs.js"
import { createPageRoutes } from "./pages.js"
import { createTextCatalogRoutes } from "./text-catalog.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
let app: Hono
const label = "freshness"
const prompts = path.resolve("prompts")
const rendering = (text = "Hello", css = "") => ({ sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "", html: `<section data-section-id="pg001_sec001" class="${css}"><p data-id="pg001_t001">${text}</p><p data-id="pg001_t002">Neighbor</p><img data-id="pg001_im001" /></section>` }] })
function storage() { return createBookStorage(label, root) }
async function outputs(): Promise<OutputStatus[]> { const response = await app.request(`/books/${label}/outputs`); expect(response.status).toBe(200); return (await response.json()).outputs }
async function send(url: string, body: unknown, method = "PUT") { return app.request(`/books/${label}/${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-catalog-freshness-"))
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Hello", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [{ imageId: "pg001_im001", buffer: Buffer.from("image"), format: "png", hash: "image", width: 20, height: 20 }] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "pg001_t001", role: "body_text", text: "Hello", isPruned: false }] }] })
  db.putNodeData("web-rendering", "pg001", rendering())
  db.putNodeData("image-captioning", "pg001", { captions: [{ imageId: "pg001_im001", caption: "A picture", reasoning: "", source: "manual" }] })
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_t001", text: "Bonjour", source: "manual" }, { id: "pg001_t002", text: "Voisin" }], generatedAt: "before" })
  reconcileTextCatalog(db)
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "output_languages: [en, fr]\neasy_read:\n  enabled: true\n")
  db.close()
  app = new Hono().use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createOutputRoutes(root, prompts))
    .route("/", createTextCatalogRoutes(root, prompts))
    .route("/", createPageRoutes(root, prompts, path.resolve("assets")))
  app.onError(errorHandler)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

describe("catalog freshness through real API/storage boundaries", () => {
  it("keeps legacy regional-language output visible and reviewable without guessing authorship", async () => {
    const db = storage()
    fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "output_languages: [en, pt-BR]\n")
    db.putNodeData("text-catalog-translation", "pt_BR", { entries: [{ id: "pg001_t001", text: "Texto legado" }], generatedAt: "old" })
    db.close()
    const status = (await outputs()).find((output) => output.identity.kind === "translation" && output.identity.id === "pg001_t001" && output.identity.language === "pt-BR")!
    expect(status).toMatchObject({ usable: true, protected: true, text: "Texto legado" })
    expect((await send("outputs/review", { identity: status.identity, signature: status.signature, contentHash: status.contentHash, action: "keep" }, "POST")).status).toBe(200)
    const verify = storage()
    const result = verify.getLatestNodeData("text-catalog-translation", "pt_BR")!.data as TextCatalogOutput
    expect(result.entries[0].source).toBeUndefined()
    expect(result.entries[0].review?.action).toBe("keep")
    verify.close()
  })

  it("inherits a neighboring protected translation warning through required preparation context", async () => {
    const first = (await outputs()).find((output) => output.identity.kind === "translation" && output.identity.id === "pg001_t001")!
    expect((await send("outputs/review", { identity: first.identity, signature: first.signature, contentHash: first.contentHash, action: "keep" }, "POST")).status).toBe(200)
    const preparation = (await outputs()).find((output) => output.identity.kind === "preparation" && output.identity.id === "pg001_t001" && output.identity.language === "fr")!
    expect(preparation.warnings).toContainEqual({ reason: "upstream", source: { kind: "translation", id: "pg001_t002", language: "fr" } })
    expect(preparation.current).toBe(false)
  })

  it("exports usable warnings, omits missing files, respects feature gates, and invalidates packaging after audio publication and restore", async () => {
    const db = storage()
    const bookDir = db.bookDir!
    const config = loadBookConfig(label, root)
    const packageOptions = { bookDir, label, language: "en", outputLanguages: ["en", "fr"], title: "Freshness fixture", webAssetsDir: path.resolve("assets/adt"), config, promptsDir: prompts, configDir: path.resolve("config") }
    const firstAsset = storeImmutableAsset(bookDir, ["audio", "fr"], "pg001_t001", "mp3", Buffer.from("first manual audio"))
    const entry = { textId: "pg001_t001", language: "fr", fileName: firstAsset.fileName, audioHash: firstAsset.contentHash, voice: "manual", model: "manual", provider: "manual", source: "manual" as const, cached: false }
    const firstVersion = publishSpeechOutput(db, "fr", { entries: [entry], generatedAt: "before" })
    const before = await outputs()
    const hash = () => computePackagingInputHash({ ...packageOptions, storage: db })
    const firstHash = hash()
    await packageAdtWeb(db, packageOptions)
    const locale = path.join(bookDir, "adt/content/i18n/fr")
    const disclosed = JSON.parse(fs.readFileSync(path.join(locale, "freshness.json"), "utf8")).outputs as OutputStatus[]
    expect(disclosed.find((output) => output.identity.kind === "translation" && output.identity.id === "pg001_t001")).toMatchObject({ included: true, protected: true })
    expect(disclosed.find((output) => output.identity.kind === "audio" && output.identity.id === "pg001_t001")).toMatchObject({ included: true, usable: true })
    expect(disclosed.find((output) => output.identity.kind === "audio" && output.identity.id === "pg001_t002")).toMatchObject({ included: false, missing: true })
    expect(await outputs()).toEqual(before)
    expect(fs.readFileSync(path.join(locale, "audio", entry.fileName), "utf8")).toBe("first manual audio")
    const secondAsset = storeImmutableAsset(bookDir, ["audio", "fr"], "pg001_t001", "mp3", Buffer.from("second manual audio"))
    publishSpeechOutput(db, "fr", { entries: [{ ...entry, fileName: secondAsset.fileName, audioHash: secondAsset.contentHash }], generatedAt: "after" })
    const secondHash = hash()
    expect(secondHash).not.toBe(firstHash)
    fs.rmSync(path.join(bookDir, ".cache"), { recursive: true, force: true })
    expect(restoreSpeechOutput(db, bookDir, "fr", firstVersion)).toBe(true)
    expect(hash()).not.toBe(secondHash)
    await packageAdtWeb(db, { ...packageOptions, features: { readAloud: false, glossary: false, quizzes: false } })
    const disabled = JSON.parse(fs.readFileSync(path.join(locale, "freshness.json"), "utf8")).outputs as OutputStatus[]
    expect(disabled.some((output) => ["audio", "timestamps", "preparation"].includes(output.identity.kind))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(locale, "audios.json"), "utf8"))).toEqual({})
    db.close()
  })

  it("cosmetic Save and opening read models preserve signatures, outputs, history and make no provider calls", async () => {
    const transport = vi.fn(() => { throw new Error("Save must not call a provider") })
    vi.stubGlobal("fetch", transport)
    const before = await outputs()
    const db = storage(); const translation = db.getLatestNodeData("text-catalog-translation", "fr"); const caption = db.getLatestNodeData("image-captioning", "pg001"); const catalog = db.getLatestNodeData("text-catalog", "book"); db.close()
    expect((await send("pages/pg001/rendering", rendering("Hello", "bg-red-500 p-4"))).status).toBe(200)
    const after = await outputs()
    expect(after).toEqual(before)
    await app.request(`/books/${label}/text-catalog`)
    const verify = storage()
    expect(verify.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translation)
    expect(verify.getLatestNodeData("image-captioning", "pg001")).toEqual(caption)
    expect(verify.getLatestNodeData("text-catalog", "book")).toEqual(catalog)
    verify.close()
    expect(transport).not.toHaveBeenCalled()
  })

  it("source edit keeps manual/legacy outputs and rejects review captured before that edit", async () => {
    const before = (await outputs()).find((item) => item.identity.kind === "translation" && item.identity.id === "pg001_t001")!
    expect((await send("pages/pg001/rendering", rendering("Changed"))).status).toBe(200)
    expect((await send("outputs/review", { identity: before.identity, signature: before.signature, contentHash: before.contentHash, action: "keep" }, "POST")).status).toBe(409)
    const after = (await outputs()).find((item) => item.identity.kind === "translation" && item.identity.id === "pg001_t001")!
    expect(after).toMatchObject({ protected: true, manual: true, usable: true, current: false, text: "Bonjour" })
    expect((await send("outputs/review", { identity: after.identity, signature: after.signature, contentHash: after.contentHash, action: "keep" }, "POST")).status).toBe(200)
    const current = (await outputs()).find((item) => item.identity.kind === "translation" && item.identity.id === "pg001_t001")!
    expect(current).toMatchObject({ protected: true, manual: true, current: true, text: "Bonjour" })
    const db = storage(); expect(db.getAllNodeVersions("text-catalog-translation", "fr")).toHaveLength(2); db.close()
  })

  it("manual Save binds to source/settings and target version; a conflict preserves the old entry and draft payload", async () => {
    const catalog = await (await app.request(`/books/${label}/text-catalog`)).json()
    const draft = { entries: catalog.translations.fr.entries.map((entry: { id: string; text: string }) => ({ id: entry.id, text: entry.id === "pg001_t001" ? "Mon texte" : entry.text })), baseVersion: catalog.translations.fr.version, sourceVersion: catalog.version, sourceSignature: catalog.translations.fr.sourceSignature }
    expect((await send("text-catalog-translation/fr", draft)).status).toBe(200)
    expect((await send("text-catalog-translation/fr", { ...draft, entries: [{ id: "pg001_t001", text: "Lost update" }] })).status).toBe(409)
    const db = storage(); const result = db.getLatestNodeData("text-catalog-translation", "fr")!.data as TextCatalogOutput
    expect(result.entries[0]).toMatchObject({ source: "manual", text: "Mon texte" })
    expect(result.entries[1]).toMatchObject({ text: "Voisin" }); expect(result.entries[1].source).toBeUndefined()
    db.close()
    const fresh = await (await app.request(`/books/${label}/text-catalog`)).json()
    expect((await send("pages/pg001/rendering", rendering("Other source"))).status).toBe(200)
    expect((await send("text-catalog-translation/fr", { ...draft, baseVersion: fresh.translations.fr.version, sourceVersion: fresh.version, sourceSignature: fresh.translations.fr.sourceSignature })).status).toBe(409)
  })

  it("glossary-only missing images are counted before captions exist; shared references retain one authoritative caption", async () => {
    const db = storage()
    db.putNodeData("glossary", "book", { items: [{ id: "gl001", word: "Term", definition: "Meaning", variations: [], emojis: [], imageId: "missing_image" }, { id: "gl002", word: "Picture", definition: "Meaning", variations: [], emojis: [], imageId: "pg001_im001" }], pageCount: 1, generatedAt: "now" })
    reconcileTextCatalog(db)
    const catalog = db.getLatestNodeData("text-catalog", "book")!.data as TextCatalogOutput
    expect(catalog.entries.filter((entry) => entry.id === "pg001_im001")).toHaveLength(1)
    expect(catalog.entries.find((entry) => entry.id === "pg001_im001")!.locations).toEqual([expect.objectContaining({ pageId: "pg001", sectionId: "pg001_sec001" })])
    db.close()
    const all = await outputs()
    expect(all.find((item) => item.identity.kind === "caption" && item.identity.id === "missing_image")).toMatchObject({ group: "glossary", missing: true })
    expect(all.filter((item) => item.identity.id === "missing_image").every((item) => ["caption", "image-translation"].includes(item.identity.kind))).toBe(true)
    expect(all.filter((item) => item.identity.kind === "caption" && item.identity.id === "pg001_im001")).toHaveLength(1)
  })

  it("a competing writer gets BOOK_BUSY before saving; it cannot overwrite a running writer", async () => {
    let release!: () => void
    const db = storage(); const dir = db.bookDir!; db.close()
    const run = withBookWriter(dir, () => new Promise<void>((resolve) => { release = resolve }))
    const response = await send("pages/pg001/rendering", rendering("Conflicting"))
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "BOOK_BUSY" })
    release(); await run
    const verify = storage(); expect(verify.getLatestNodeData("web-rendering", "pg001")!.data).toEqual(rendering()); verify.close()
  })
  it("HTML alt edits use the authoritative caption store and reject an intervening caption edit atomically", async () => {
    const first = rendering()
    first.sections[0].html = first.sections[0].html.replace('<img data-id="pg001_im001" />', '<img data-id="pg001_im001" alt="A picture" />')
    expect((await send("pages/pg001/rendering", first)).status).toBe(200)
    const draft = structuredClone(first)
    draft.sections[0].html = draft.sections[0].html.replace('alt="A picture"', 'alt="My authored caption"')
    expect((await send("pages/pg001/rendering", draft)).status).toBe(200)
    const db = storage()
    expect(db.getLatestNodeData("image-captioning", "pg001")!.data).toMatchObject({ captions: [{ caption: "My authored caption", source: "manual" }] })
    expect(db.getLatestNodeData("text-catalog", "book")!.data).toMatchObject({ entries: expect.arrayContaining([{ id: "pg001_im001", text: "My authored caption", locations: expect.any(Array) }]) })
    const before = db.getLatestNodeData("web-rendering", "pg001")
    db.putNodeData("image-captioning", "pg001", { captions: [{ imageId: "pg001_im001", caption: "Concurrent correction", reasoning: "", source: "manual" }] })
    db.close()
    draft.sections[0].html = draft.sections[0].html.replace('alt="My authored caption"', 'alt="Stale draft"')
    expect((await send("pages/pg001/rendering", draft)).status).toBe(409)
    const verify = storage()
    expect(verify.getLatestNodeData("web-rendering", "pg001")).toEqual(before)
    expect(verify.getLatestNodeData("image-captioning", "pg001")!.data).toMatchObject({ captions: [{ caption: "Concurrent correction" }] })
    verify.close()
  })

})

it("retires removed membership, discovers new text and image work, and restores the original identities without losing corrections (Example 4)", async () => {
  const provider = vi.fn(() => { throw new Error("Save called a provider") })
  vi.stubGlobal("fetch", provider)
  const before = await outputs()
  const db = storage()
  const correction = db.getLatestNodeData("text-catalog-translation", "fr")
  const oldRender = db.getLatestNodeData("web-rendering", "pg001")
  db.close()
  const changed = rendering()
  changed.sections[0].html = changed.sections[0].html.replace('<p data-id="pg001_t001">Hello</p>', '<p data-id="new-stable-text">New phrase</p><img data-id="new-image" />')
  expect((await send("pages/pg001/rendering", changed)).status).toBe(200)
  const after = await outputs()
  expect(after.some((output) => output.identity.id === "pg001_t001")).toBe(false)
  expect(after.find((output) => output.identity.id === "new-stable-text" && output.identity.kind === "translation")).toMatchObject({ missing: true, usable: false })
  expect(after.find((output) => output.identity.id === "new-image" && output.identity.kind === "caption")).toMatchObject({ missing: true })
  const neighbor = (items: OutputStatus[]) => items.find((output) => output.identity.kind === "translation" && output.identity.id === "pg001_t002")
  expect(neighbor(after)).toEqual(neighbor(before))
  expect((await send("pages/pg001/rendering", oldRender!.data)).status).toBe(200)
  const restored = await outputs()
  expect(restored.find((output) => output.identity.id === "pg001_t001" && output.identity.kind === "translation")).toMatchObject({ text: "Bonjour", manual: true, protected: true })
  expect(restored.some((output) => output.identity.id === "new-stable-text")).toBe(false)
  const verify = storage(); expect(verify.getLatestNodeData("text-catalog-translation", "fr")).toEqual(correction); verify.close()
  expect(provider).not.toHaveBeenCalled()
})

it("checking a declared fallback resolves only that warning and reappears after relevant input changes", async () => {
  const before = (await outputs()).find((output) => output.identity.kind === "preparation" && output.identity.id === "pg001_t001" && output.identity.language === "fr")!
  expect(before.warnings.some((warning) => warning.reason.startsWith("preparation-"))).toBe(true)
  expect((await send("outputs/review", { identity: before.identity, signature: before.signature, contentHash: before.contentHash, action: "checked" }, "POST")).status).toBe(200)
  const checked = (await outputs()).find((output) => output.identity.kind === "preparation" && output.identity.id === "pg001_t001" && output.identity.language === "fr")!
  expect(checked.warnings.some((warning) => warning.reason.startsWith("preparation-"))).toBe(false)
  expect(checked.warnings.some((warning) => warning.reason === "upstream")).toBe(true)
  const db = storage(); db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_t001", text: "Bonjour encore", source: "manual" }], generatedAt: "changed" }); db.close()
  const changed = (await outputs()).find((output) => output.identity.kind === "preparation" && output.identity.id === "pg001_t001" && output.identity.language === "fr")!
  expect(changed.warnings.some((warning) => warning.reason.startsWith("preparation-"))).toBe(true)
})
