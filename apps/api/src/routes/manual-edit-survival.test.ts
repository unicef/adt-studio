import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb, withBookWriter } from "@adt/storage"
import { reconcileTextCatalog, packageAdtWeb, loadBookConfig } from "@adt/pipeline"
import { PIPELINE } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { createTextCatalogRoutes } from "./text-catalog.js"
import { createTocRoutes } from "./toc.js"
import { createQuizRoutes } from "./quizzes.js"
import { createGlossaryRoutes } from "./glossary.js"
import { createStageRoutes } from "./stages.js"
import { createDebugRoutes } from "./debug.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createTaskService } from "../services/task-service.js"
import { createStageRunner } from "../services/stage-runner.js"
import { createStageService } from "../services/stage-service.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

const { sectionPage, generateToc, generateAllQuizzes, generateObject, renderPage } = vi.hoisted(() => ({ sectionPage: vi.fn(), generateToc: vi.fn(), generateAllQuizzes: vi.fn(), generateObject: vi.fn(), renderPage: vi.fn() }))
vi.mock("@adt/pipeline", async (original) => ({ ...await original<typeof import("@adt/pipeline")>(), sectionPage, generateToc, generateAllQuizzes, renderPage }))
vi.mock("@adt/llm", async (original) => ({ ...await original<typeof import("@adt/llm")>(), createLLMModel: () => ({ generateObject }) }))

let root: string, app: Hono, configPath: string
let service: ReturnType<typeof createStageService>
let bus: ReturnType<typeof createBookEventBus>
const label = "manual-fixture"
const prompts = path.resolve("prompts"), assets = path.resolve("assets/adt")
const book = () => createBookStorage(label, root)
const section = (id: string, text: string) => ({ sectionId: `${id}_sec001`, sectionType: "text_only", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: `${id}_t001`, role: "section_text", text, isPruned: false }] })
const quiz = (question = "AI question") => ({ quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question, answerIndex: 0, reasoning: "", options: [{ text: "One", explanation: "Correct" }, { text: "Two", explanation: "No" }, { text: "Three", explanation: "No" }] })
const send = (url: string, body: unknown, method = "PUT") => app.request(`/books/${label}/${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
async function json(url: string) { const response = await app.request(`/books/${label}/${url}`); expect(response.status, await response.clone().text()).toBe(200); return response.json() }
function read(node: string, itemId = "book") { const db = book(); try { return db.getLatestNodeData(node, itemId) } finally { db.close() } }
async function run(stage: string, extra = {}) {
  let done: { status: string; error?: string } | undefined
  const dispose = bus.addListener(label, (event) => {
    if (event.type === "stage-run-complete") done = { status: "completed" }
    if (event.type === "stage-run-error") done = { status: "failed", error: event.error }
    if (event.type === "stage-run-cancelled") done = { status: "cancelled" }
  })
  const response = await send("stages/run", { fromStage: stage, toStage: stage, ...extra }, "POST")
  expect(response.status, await response.clone().text()).toBe(200)
  await vi.waitFor(() => expect(done).toBeDefined(), { timeout: 5000 })
  dispose()
  return done!
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-manual-survival-"))
  configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, 'default_model: ollama:tinyllama\nrole_types:\n  section_text: Text\nstructure_types: {}\noutput_languages: [en, fr]\ncore_tts:\n  latex_to_speech: false\n  language_normalization: false\n')
  const db = book()
  for (let n = 1; n <= 3; n++) {
    const id = `pg00${n}`
    db.putExtractedPage({ pageId: id, pageNumber: n, text: "Source", images: n === 1 ? [{ imageId: "pg001_im001", buffer: Buffer.from("image"), format: "png", hash: "image", width: 1, height: 1 }] : [], pageImage: { imageId: `${id}_page`, buffer: Buffer.from("image"), format: "png", hash: "image", width: 1, height: 1 } })
    db.putNodeData("page-sectioning", id, { source: "ai", reasoning: "", sections: [section(id, "Saved page text")] })
    db.putNodeData("web-rendering", id, { sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "", html: `<section data-section-id="${id}_sec001"><p data-id="${id}_t001">Saved page text</p>${n === 1 ? '<img data-id="pg001_im001" />' : ""}</section>` }] })
  }
  db.putNodeData("metadata", "book", { language_code: "en", title: "Fixture" })
  db.putNodeData("toc-generation", "book", { source: "ai", entries: [{ id: "toc1", title: "AI TOC", sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "ch1", level: 1 }], pageCount: 3, generatedAt: "before" })
  db.putNodeData("quiz-generation", "book", { generatedAt: "before", language: "en", pagesPerQuiz: 1, quizzes: [{ ...quiz(), quizId: "qz001", source: "ai" }] })
  reconcileTextCatalog(db)
  db.close()
  sectionPage.mockReset().mockResolvedValue({ reasoning: "new", sections: [] })
  generateToc.mockReset().mockResolvedValue({ entries: [], pageCount: 3, generatedAt: "new" })
  generateAllQuizzes.mockReset().mockResolvedValue({ generatedAt: "new", language: "en", pagesPerQuiz: 1, quizzes: [quiz("New AI question")] })
  generateObject.mockReset().mockImplementation(async ({ context, prompt }: { context: { texts?: Array<{ text: string }> }; prompt: string }) => ({ object: prompt.includes("glossary") ? { items: [], reasoning: "fixture" } : { translations: (context.texts ?? []).map((t) => `French ${t.text}`) } }))
  renderPage.mockReset().mockImplementation(async ({ sectioning, pageId }: { sectioning: import("@adt/types").PageSectioningOutput; pageId: string }) => ({ sections: sectioning.sections.map((section, sectionIndex) => ({ sectionIndex, sectionType: section.sectionType, reasoning: "fixture", html: `<section data-section-id="${section.sectionId}">${section.nodes.map((node) => `<p data-id="${node.nodeId}">${node.text ?? ""}</p>`).join("")}${pageId === "pg001" ? '<img data-id="pg001_im001" />' : ""}</section>` })) }))
  bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  service = createStageService(createStageRunner(), bus, decisions)
  app = new Hono().use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createPageRoutes(root, prompts, assets, configPath))
    .route("/", createTextCatalogRoutes(root, prompts, configPath))
    .route("/", createTocRoutes(root))
    .route("/", createQuizRoutes(root, prompts, configPath))
    .route("/", createGlossaryRoutes(root, prompts, configPath))
    .route("/", createDebugRoutes(root, prompts, configPath))
    .route("/", createAdtPreviewRoutes(root, assets, configPath, prompts))
    .route("/", createStageRoutes(service, bus, decisions, root, prompts, assets, configPath))
  app.onError(errorHandler)
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

async function saveProtected() {
  for (const id of ["pg001", "pg002", "pg003"]) {
    expect((await send(`pages/${id}/sectioning`, { ...read("page-sectioning", id)!.data as object, baseVersion: 1 })).status).toBe(200)
  }
  const toc = await json("toc")
  expect((await send("toc", { ...toc, entries: [{ ...toc.entries[0], title: "Manual contents" }], baseVersion: toc.version })).status).toBe(200)
  const quizzes = await json("quizzes")
  expect((await send("quizzes", { ...quizzes.quizzes, quizzes: [{ ...quizzes.quizzes.quizzes[0], question: "Manual question" }], baseVersion: quizzes.version })).status).toBe(200)
  const page = await json("pages/pg001")
  expect((await send("pages/pg001/image-captioning", { captions: [{ imageId: "pg001_im001", caption: "Manual caption", reasoning: "" }], baseVersion: 0, sourceSignature: page.captionSourceSignature })).status).toBe(200)
  expect((await send("glossary", { items: [{ id: "gl001", word: "Term", definition: "Manual definition", variations: [], emojis: [], source: "manual" }], pageCount: 3, generatedAt: "fixture" })).status).toBe(200)
  const catalog = await json("text-catalog")
  expect((await send("text-catalog-translation/fr", { entries: catalog.entries.map((e: { id: string }) => ({ id: e.id, text: `Manual French ${e.id}` })), baseVersion: 0, sourceVersion: catalog.version, sourceSignature: catalog.translations.fr.sourceSignature })).status).toBe(200)
}

it("saves, runs real admission/preparation/workers, reads history, previews and exports protected content", async () => {
  await saveProtected()
  const manualQuizId = (await json("quizzes")).quizzes.quizzes[0].quizId
  for (const stage of ["sectioning", "toc", "quizzes", "captions", "glossary", "translate"]) expect((await run(stage)).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(generateToc).not.toHaveBeenCalled()
  expect(read("page-sectioning", "pg001")!.version).toBe(2)
  expect((await json("toc")).entries[0].title).toBe("Manual contents")
  expect((await json("quizzes")).quizzes.quizzes).toEqual(expect.arrayContaining([expect.objectContaining({ quizId: manualQuizId, source: "manual", question: "Manual question" })]))
  expect((await run("sectioning", { toStage: "translate" })).status).toBe("completed")
  expect(read("image-captioning", "pg001")!.data).toMatchObject({ captions: [expect.objectContaining({ source: "manual", caption: "Manual caption" })] })
  expect(read("glossary")!.data).toMatchObject({ items: [expect.objectContaining({ source: "manual", definition: "Manual definition" })] })
  for (const [node, itemId] of [["page-sectioning", "pg001"], ["toc-generation", "book"], ["quiz-generation", "book"], ["text-catalog-translation", "fr"], ["image-captioning", "pg001"], ["glossary", "book"]]) {
    const history = await json(`debug/versions/${node}/${itemId}?includeData=true`)
    expect(JSON.stringify(history)).toContain('"manual"')
  }
  expect(JSON.stringify(await json("adt-preview/content/toc.json"))).toContain("Manual contents")
  expect(JSON.stringify(await json("adt-preview/content/i18n/fr/texts.json"))).toContain("Manual French pg001_t001")
  const preview = await app.request(`/books/${label}/adt-preview/pg001_sec001.html`)
  expect(preview.status).toBe(200)
  expect(await preview.text()).toContain("Saved page text")
  const quizPreview = await app.request(`/books/${label}/adt-preview/${manualQuizId}.html`)
  expect(quizPreview.status).toBe(200)
  expect(await quizPreview.text()).toContain("Manual question")
  const db = book()
  try {
    await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en", "fr"], title: "Fixture", webAssetsDir: assets, promptsDir: prompts, configDir: path.resolve("config"), config: loadBookConfig(label, root, configPath) })
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/content/toc.json"), "utf8")).toContain("Manual contents")
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/content/i18n/fr/texts.json"), "utf8")).toContain("Manual French pg001_t001")
    expect(fs.readFileSync(path.join(db.bookDir!, `adt/${manualQuizId}.html`), "utf8")).toContain("Manual question")
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/pg001_sec001.html"), "utf8")).toContain("Saved page text")
  } finally { db.close() }
}, 60_000)

it("requires versions, returns the current version on conflict, rejects a concurrent writer and keeps restored authorship", async () => {
  await saveProtected()
  const cases = [
    ["toc", { ...await json("toc") }, "toc-generation", "book"],
    ["quizzes", (await json("quizzes")).quizzes, "quiz-generation", "book"],
    ["pages/pg001/sectioning", read("page-sectioning", "pg001")!.data, "page-sectioning", "pg001"],
  ] as const
  for (const [url, value, node, itemId] of cases) {
    const version = read(node, itemId)!.version
    expect((await send(url, value)).status).toBe(400)
    const stale = await send(url, { ...value as object, baseVersion: version - 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: version })
    const db = book(); db.markStepStarted(node === "quiz-generation" ? "quiz-generation" : node === "toc-generation" ? "toc-generation" : "page-sectioning"); db.close()
    expect((await send(url, { ...value as object, baseVersion: version })).status).toBe(409)
    const clear = book(); clear.markStepCompleted(node === "quiz-generation" ? "quiz-generation" : node === "toc-generation" ? "toc-generation" : "page-sectioning"); clear.close()
    expect(read(node, itemId)!.version).toBe(version)
  }
  let release!: () => void
  const holding = withBookWriter(path.join(root, label), () => new Promise<void>((resolve) => { release = resolve }))
  await vi.waitFor(() => expect(release).toBeDefined())
  expect((await send("toc", { ...await json("toc"), baseVersion: 2 })).status).toBe(409)
  release()
  await holding

  expect((await send("versions/toc-generation/book/restore", { version: 1, baseVersion: 1 }, "POST")).status).toBe(409)
  expect((await send("versions/toc-generation/book/restore", { version: 1, baseVersion: 2 }, "POST")).status).toBe(200)
  expect((await json("toc")).source).toBe("ai")
  expect((await run("toc")).status).toBe("completed")
  expect(generateToc).toHaveBeenCalledTimes(1)

  // Restoring protected content must not convert it to AI or authorize a rerun.
  expect((await send("versions/toc-generation/book/restore", { version: 2, baseVersion: 3 }, "POST")).status).toBe(200)
  generateToc.mockClear()
  expect((await run("toc")).status).toBe("completed")
  expect((await json("toc"))).toMatchObject({ source: "manual", version: 2 })
  expect(generateToc).not.toHaveBeenCalled()

  const db = book()
  const legacyVersion = db.putNodeData("toc-generation", "book", { entries: [], pageCount: 3, generatedAt: "legacy" })
  db.close()
  const save = await send("toc", { ...await json("toc"), baseVersion: legacyVersion })
  expect(save.status).toBe(200)
  const saved = await save.json()
  expect((await send("versions/toc-generation/book/restore", { version: legacyVersion, baseVersion: saved.version }, "POST")).status).toBe(200)
  expect((await run("toc")).status).toBe("completed")
  expect((await json("toc")).source).toBeUndefined()
  expect(read("toc-generation")!.version).toBe(legacyVersion)
  expect(generateToc).not.toHaveBeenCalled()
})

it("protects the empty page after deletion and both pages after a cross-page merge", async () => {
  expect((await send("pages/pg001/sections/0/merge-cross-page?direction=next", { baseVersion: 1, targetBaseVersion: 1 }, "POST")).status).toBe(200)
  expect(read("page-sectioning", "pg001")!.data).toMatchObject({ source: "manual", sections: [] })
  expect(read("page-sectioning", "pg002")!.data).toMatchObject({ source: "manual" })
  const moved = JSON.stringify([read("page-sectioning", "pg001")!.data, read("page-sectioning", "pg002")!.data])
  expect(moved.match(/pg001_t001/g)).toHaveLength(1)
  expect((await send("pages/pg003/sections/0", { baseVersion: 1 }, "DELETE")).status).toBe(200)
  expect((await run("sectioning")).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(read("page-sectioning", "pg003")!.data).toMatchObject({ source: "manual", sections: [] })
})

it("names protected replacement snapshots and leaves them current on failed or cancelled generation", async () => {
  await saveProtected()
  expect((await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", replaceManual: true }, "POST")).status).toBe(409)
  const status = await json("step-status")
  const replacement = { replaceManual: true, protectedReplacements: status.protectedWork.filter((r: { node: string }) => r.node === "page-sectioning").map(({ node, itemId, version }: import("@adt/types").AuthoredReplacement) => ({ node, itemId, version })) }
  const db = book()
  for (const stage of PIPELINE.filter((s) => s.name === "extract")) for (const step of stage.steps) db.markStepCompleted(step.name)
  // Valid outline so no unrelated LLM prerequisite is involved.
  db.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  db.close()
  sectionPage.mockRejectedValue(new Error("provider unavailable"))
  expect((await run("sectioning", replacement)).status).toBe("failed")
  expect(read("page-sectioning", "pg001")!.version).toBe(2)
  expect((await json("toc")).entries[0].sectionId).toBe("pg001_sec001")
})

it("publishes a confirmed TOC replacement only on success and retains the manual history on cancellation", async () => {
  await saveProtected()
  const replacement = { replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 2 }] }
  let finish!: (value: unknown) => void
  generateToc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const cancelled = run("toc", replacement)
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect((await send("stages/cancel", {}, "POST")).status).toBe(202)
  finish({ entries: [], pageCount: 3, generatedAt: "cancelled" })
  expect((await cancelled).status).toBe("cancelled")
  expect(read("toc-generation")!.version).toBe(2)
  expect((await run("toc", replacement)).status).toBe("completed")
  expect(read("toc-generation")!.data).toMatchObject({ source: "ai", entries: [] })
  expect(JSON.stringify(await json("debug/versions/toc-generation/book?includeData=true"))).toContain("Manual contents")
  // A duplicate confirmation cannot replace a newer document.
  expect((await send("stages/run", { fromStage: "toc", toStage: "toc", ...replacement }, "POST")).status).toBe(409)
})

it("retires sections and TOC references only when replacement publishes, with fresh section identities", async () => {
  await saveProtected()
  const db = book()
  for (const stage of PIPELINE.filter((s) => s.name === "extract")) for (const step of stage.steps) db.markStepCompleted(step.name)
  db.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  db.close()
  const protectedReplacements = ["pg001", "pg002", "pg003"].map((itemId) => ({ node: "page-sectioning", itemId, version: 2 }))
  let release!: () => void
  sectionPage.mockImplementation(async ({ pageId }: { pageId: string }) => {
    if (pageId === "pg001") await new Promise<void>((resolve) => { release = resolve })
    return { reasoning: "new", sections: [section(pageId, "New generated text")] }
  })
  const pending = run("sectioning", { replaceManual: true, protectedReplacements })
  await vi.waitFor(() => expect(release).toBeDefined())
  expect(read("page-sectioning", "pg001")!.version).toBe(2)
  expect((await json("toc")).entries[0].sectionId).toBe("pg001_sec001")
  release()
  expect((await pending).status).toBe("completed")
  expect(read("page-sectioning", "pg001")!.data).toMatchObject({ source: "ai", sections: [expect.objectContaining({ sectionId: "pg001_sec002" })] })
  expect((await json("toc"))).toMatchObject({ source: "manual", entries: [] })
  expect(JSON.stringify(await json("debug/versions/toc-generation/book?includeData=true"))).toContain("pg001_sec001")
})

it("removes inactive translation entries, recovers the same IDs after restore and never borrows their corrections for new IDs", async () => {
  await saveProtected()
  const rendering = read("web-rendering", "pg001")!
  expect((await send("pages/pg001/rendering", { sections: [] })).status).toBe(200)
  expect((await run("translate")).status).toBe("completed")
  expect(read("text-catalog-translation", "fr")!.data).toMatchObject({ entries: expect.not.arrayContaining([expect.objectContaining({ id: "pg001_t001" })]) })
  expect(JSON.stringify(await json("debug/versions/text-catalog-translation/fr?includeData=true"))).toContain("Manual French pg001_t001")
  expect((await send("versions/web-rendering/pg001/restore", { version: rendering.version, baseVersion: 2 }, "POST")).status).toBe(200)
  expect((await run("translate")).status).toBe("completed")
  expect(read("text-catalog-translation", "fr")!.data).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ id: "pg001_t001", source: "manual", text: "Manual French pg001_t001" })]) })
})

it("protects unknown page and TOC provenance without adding a version", async () => {
  const db = book()
  for (const id of ["pg001", "pg002", "pg003"]) db.putNodeData("page-sectioning", id, { reasoning: "legacy", sections: [] })
  db.putNodeData("toc-generation", "book", { entries: [], pageCount: 3, generatedAt: "legacy" })
  db.close()
  expect((await run("sectioning")).status).toBe("completed")
  expect((await run("toc")).status).toBe("completed")
  expect(read("page-sectioning", "pg001")!.version).toBe(2)
  expect(read("toc-generation")!.version).toBe(2)
  expect(sectionPage).not.toHaveBeenCalled()
  expect(generateToc).not.toHaveBeenCalled()
})

it("keeps protected quiz and option identities, translations and recordings while replacing AI neighbors, including no eligible pages", async () => {
  const db = book()
  db.putNodeData("quiz-generation", "book", { generatedAt: "before", language: "en", pagesPerQuiz: 1, quizzes: [
    { ...quiz("Manual question"), quizId: "qz001", source: "manual", options: quiz().options.map((o, i) => ({ ...o, optionId: `qz001_o${i}` })) },
    { ...quiz("Legacy question"), quizId: "qz002", afterPageId: "pg002" },
    { ...quiz("Old AI question"), quizId: "qz003", source: "ai" },
  ] })
  db.putNodeData("tts", "en", { entries: [{ textId: "qz001_que", language: "en", fileName: "qz001_que.mp3", provider: "manual", model: "manual", voice: "manual", voiceSlot: "primary", cached: false }] })
  fs.mkdirSync(path.join(db.bookDir!, "audio/en"), { recursive: true })
  fs.writeFileSync(path.join(db.bookDir!, "audio/en/qz001_que.mp3"), "UNCHANGED RECORDING")
  reconcileTextCatalog(db)
  db.close()
  const prior = (await json("quizzes")).quizzes.quizzes
  expect((await run("quizzes")).status).toBe("completed")
  const current = (await json("quizzes")).quizzes.quizzes
  expect(current.find((q: { quizId: string }) => q.quizId === "qz001")).toEqual(prior[0])
  expect(current.find((q: { quizId: string }) => q.quizId === "qz002")).toMatchObject({ question: "Legacy question" })
  expect(current.map((q: { quizId: string }) => q.quizId)).toEqual(["qz001", "qz004", "qz002"])
  expect(fs.readFileSync(path.join(root, label, "audio/en/qz001_que.mp3"), "utf8")).toBe("UNCHANGED RECORDING")
  expect(read("tts", "en")!.data).toMatchObject({ entries: [expect.objectContaining({ textId: "qz001_que", provider: "manual" })] })
  const noPages = book(); noPages.clearNodesByType(["web-rendering"]); noPages.close()
  generateAllQuizzes.mockClear()
  expect((await run("quizzes")).status).toBe("completed")
  expect(generateAllQuizzes).not.toHaveBeenCalled()
  expect((await json("quizzes")).quizzes.quizzes.map((q: { quizId: string }) => q.quizId)).toEqual(["qz001", "qz002"])
})

it("requires named quiz replacement, keeps protected work on failure/cancellation and publishes a fresh AI identity only on success", async () => {
  await saveProtected()
  const body = { pageIds: ["pg001"], afterPageId: "pg001", placement: "replace", baseVersion: 2 }
  expect((await send("quizzes/generate-one", body, "POST")).status).toBe(409)
  expect(generateObject).not.toHaveBeenCalled()
  generateObject.mockRejectedValueOnce(new Error("provider unavailable"))
  const named = { ...body, replaceQuizIds: ["qz001"] }
  expect((await send("quizzes/generate-one", named, "POST")).status).toBe(500)
  expect(read("quiz-generation")!.version).toBe(2)
  let finish!: (value: unknown) => void
  generateObject.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const controller = new AbortController()
  const pending = app.request(`/books/${label}/quizzes/generate-one`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(named), signal: controller.signal })
  await vi.waitFor(() => expect(finish).toBeDefined())
  controller.abort()
  const generated = { object: { question: "Replacement", options: quiz().options, answer_index: 0, reasoning: "Generated" } }
  finish(generated)
  expect((await pending).status).toBeGreaterThanOrEqual(400)
  expect(read("quiz-generation")!.version).toBe(2)
  generateObject.mockResolvedValueOnce(generated)
  const success = await send("quizzes/generate-one", named, "POST")
  expect(success.status, await success.clone().text()).toBe(200)
  expect((await success.json()).quiz).toMatchObject({ quizId: "qz002", source: "ai", question: "Replacement" })
  expect(JSON.stringify(await json("debug/versions/quiz-generation/book?includeData=true"))).toContain("Manual question")
  expect((await send("quizzes/generate-one", named, "POST")).status).toBe(409)
})

it("stamps only changed translations and rejects stale, missing and running-step saves without losing history", async () => {
  const db = book()
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_t001", text: "AI", source: "ai" }, { id: "pg002_t001", text: "Legacy" }, { id: "pg003_t001", text: "Manual", source: "manual" }], generatedAt: "before" })
  db.close()
  const catalog = await json("text-catalog")
  const content = { entries: [{ id: "pg001_t001", text: "Corrected", source: "ai" }, { id: "pg002_t001", text: "Legacy", source: "ai" }, { id: "pg003_t001", text: "Manual", source: "ai" }], sourceVersion: catalog.version, sourceSignature: catalog.translations.fr.sourceSignature }
  expect((await send("text-catalog-translation/fr", content)).status).toBe(400)
  expect((await send("text-catalog-translation/fr", { ...content, baseVersion: 1 })).status).toBe(200)
  expect(read("text-catalog-translation", "fr")!.data).toMatchObject({ entries: [{ id: "pg001_t001", source: "manual" }, { id: "pg002_t001", text: "Legacy" }, { id: "pg003_t001", source: "manual" }] })
  expect((read("text-catalog-translation", "fr")!.data as { entries: object[] }).entries[1]).not.toHaveProperty("source")
  const stale = await send("text-catalog-translation/fr", { ...content, baseVersion: 1 })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ currentVersion: 2, code: "VERSION_CONFLICT" })
  const busy = book(); busy.markStepStarted("text-catalog-translation"); busy.close()
  expect((await send("text-catalog-translation/fr", { ...content, baseVersion: 2 })).status).toBe(409)
  expect((await send("versions/text-catalog-translation/fr/restore", { version: 1, baseVersion: 2 }, "POST")).status).toBe(409)
  const stopped = book(); stopped.markStepCompleted("text-catalog-translation"); stopped.close()
  expect(read("text-catalog-translation", "fr")!.version).toBe(2)
  expect((await run("translate")).status).toBe("completed")
  expect((read("text-catalog-translation", "fr")!.data as { entries: object[] }).entries).toEqual(expect.arrayContaining([expect.objectContaining({ id: "pg001_t001", text: "Corrected", source: "manual" }), { id: "pg002_t001", text: "Legacy" }]))
})

it("allows an active translation correction when an untouched saved entry has lost its source", async () => {
  await saveProtected()
  const db = book()
  db.putNodeData("web-rendering", "pg002", { sections: [] })
  reconcileTextCatalog(db)
  db.close()
  const catalog = await json("text-catalog")
  expect(catalog.entries.some((entry: { id: string }) => entry.id === "pg002_t001")).toBe(false)
  const body = {
    baseVersion: catalog.translations.fr.version, sourceVersion: catalog.version,
    sourceSignature: catalog.translations.fr.sourceSignature,
    entries: catalog.translations.fr.entries.map((entry: { id: string; text: string }) => ({ id: entry.id, text: entry.id === "pg001_t001" ? "New active correction" : entry.text })),
  }
  const save = await send("text-catalog-translation/fr", body)
  expect(save.status, await save.clone().text()).toBe(200)
  const latest = await json("text-catalog")
  const removedEdit = await send("text-catalog-translation/fr", { ...body, baseVersion: latest.translations.fr.version, entries: [{ id: "pg002_t001", text: "Cannot edit retired source" }] })
  expect(removedEdit.status).toBe(409)
  expect((await run("translate")).status).toBe("completed")
  const active = read("text-catalog-translation", "fr")!.data as { entries: { id: string; text: string }[] }
  expect(active.entries.find((entry) => entry.id === "pg001_t001")?.text).toBe("New active correction")
  expect(active.entries.some((entry) => entry.id === "pg002_t001")).toBe(false)
  expect(JSON.stringify(await json("debug/versions/text-catalog-translation/fr?includeData=true"))).toContain("Manual French pg002_t001")
})

it("guards the same saved translation version through canonical and legacy language aliases", async () => {
  fs.writeFileSync(configPath, fs.readFileSync(configPath, "utf8").replace("[en, fr]", "[en, fr-CA]"))
  const db = book()
  db.putNodeData("text-catalog-translation", "fr_CA", { entries: [{ id: "pg001_t001", text: "Protected correction", source: "manual" }], generatedAt: "fixture" })
  db.close()
  const catalog = await json("text-catalog")
  const body = { entries: [{ id: "pg001_t001", text: "New correction" }], sourceVersion: catalog.version, sourceSignature: catalog.translations.fr_CA.sourceSignature }
  const stale = await send("text-catalog-translation/fr-CA", { ...body, baseVersion: 0 })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 })
  expect((await send("text-catalog-translation/fr-CA", { ...body, baseVersion: 1 })).status).toBe(200)
  expect(read("text-catalog-translation", "fr-CA")).toBeNull()
  expect(read("text-catalog-translation", "fr_CA")!.data).toMatchObject({ entries: [{ text: "New correction", source: "manual" }] })
  expect((await send("text-catalog-translation/fr_CA", { ...body, baseVersion: 1 })).status).toBe(409)
})

it.each(["clone", "split", "merge"])("guards and stamps %s as a whole manual page and preserves it on rerun", async (operation) => {
  const db = book()
  db.putNodeData("page-sectioning", "pg001", { source: "ai", reasoning: "", sections: [
    { ...section("pg001", "First"), nodes: [...section("pg001", "First").nodes, { nodeId: "pg001_t002", role: "section_text", text: "Second", isPruned: false }] },
    { ...section("pg001", "Last"), sectionId: "pg001_sec002", nodes: [{ nodeId: "pg001_t003", role: "section_text", text: "Last", isPruned: false }] },
  ] })
  db.close()
  for (const id of ["pg002", "pg003"]) expect((await send(`pages/${id}/sectioning`, { ...read("page-sectioning", id)!.data as object, baseVersion: 1 })).status).toBe(200)
  const url = `pages/pg001/sections/0/${operation}${operation === "merge" ? "?direction=next" : ""}`
  const details = operation === "split" ? { beforeNodeIndex: 1 } : {}
  expect((await send(url, details, "POST")).status).toBe(400)
  expect((await send(url, { ...details, baseVersion: 1 }, "POST")).status).toBe(409)
  expect(read("page-sectioning", "pg001")!.version).toBe(2)
  const response = await send(url, { ...details, baseVersion: 2 }, "POST")
  expect(response.status, await response.clone().text()).toBe(200)
  const saved = read("page-sectioning", "pg001")!
  expect(saved.data).toMatchObject({ source: "manual" })
  expect((await run("sectioning")).status).toBe("completed")
  expect(read("page-sectioning", "pg001")).toEqual(saved)
  expect(sectionPage).not.toHaveBeenCalled()
})

it("rejects a stale target page before a cross-page merge mutates either page", async () => {
  const before = [read("page-sectioning", "pg001"), read("page-sectioning", "pg002")]
  const response = await send("pages/pg001/sections/0/merge-cross-page?direction=next", { baseVersion: 1, targetBaseVersion: 0 }, "POST")
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ currentVersion: 1 })
  expect([read("page-sectioning", "pg001"), read("page-sectioning", "pg002")]).toEqual(before)
})

it("rolls retirement and reference writes back if publishing a replacement page fails in SQLite", async () => {
  await saveProtected()
  const db = book()
  for (const stage of PIPELINE.filter((s) => s.name === "extract")) for (const step of stage.steps) db.markStepCompleted(step.name)
  db.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  db.close()
  const sql = openBookDb(path.join(root, label, `${label}.db`))
  sql.exec("CREATE TRIGGER reject_generated_page BEFORE INSERT ON node_data WHEN NEW.node = 'page-sectioning' BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END")
  sql.close()
  const previousToc = read("toc-generation")
  sectionPage.mockImplementation(async ({ pageId }: { pageId: string }) => ({ reasoning: "new", sections: [section(pageId, "New")] }))
  const protectedReplacements = ["pg001", "pg002", "pg003"].map((itemId) => ({ node: "page-sectioning", itemId, version: 2 }))
  expect((await run("sectioning", { replaceManual: true, protectedReplacements })).status).toBe("failed")
  expect(read("toc-generation")).toEqual(previousToc)
  for (const id of ["pg001", "pg002", "pg003"]) expect(read("page-sectioning", id)!.version).toBe(2)
  expect((await json("debug/versions/page-sectioning/pg001?includeData=true")).versions).toHaveLength(2)
})

it("cancels section replacement before publication and rejects a queued stale confirmation", async () => {
  await saveProtected()
  const db = book()
  for (const stage of PIPELINE.filter((s) => s.name === "extract")) for (const step of stage.steps) db.markStepCompleted(step.name)
  db.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  db.close()
  const releases: Array<() => void> = []
  sectionPage.mockImplementation(async () => { await new Promise<void>((resolve) => releases.push(resolve)); return { reasoning: "new", sections: [] } })
  const protectedReplacements = ["pg001", "pg002", "pg003"].map((itemId) => ({ node: "page-sectioning", itemId, version: 2 }))
  const cancelled = run("sectioning", { replaceManual: true, protectedReplacements })
  await vi.waitFor(() => expect(releases).toHaveLength(3))
  expect((await send("stages/cancel", {}, "POST")).status).toBe(202)
  releases.forEach((release) => release())
  expect((await cancelled).status).toBe("cancelled")
  for (const id of ["pg001", "pg002", "pg003"]) expect(read("page-sectioning", id)!.version).toBe(2)
  expect((await json("toc")).entries[0].sectionId).toBe("pg001_sec001")

  // Queue a TOC replacement behind another run of the same document. Admission
  // must check again after the first run publishes, before preparation/model work.
  let finish!: () => void
  generateToc.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { finish = resolve }); return { entries: [], pageCount: 3, generatedAt: "new" } })
  const body = { fromStage: "toc", toStage: "toc", replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 2 }] }
  const errors: string[] = []
  const dispose = bus.addListener(label, (event) => { if (event.type === "stage-run-error") errors.push(event.error) })
  expect((await send("stages/run", body, "POST")).status).toBe(200)
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect((await send("stages/run", body, "POST")).status).toBe(200)
  finish()
  await vi.waitFor(() => expect(errors.join(" ")).toContain("Content changed"))
  dispose()
  expect(generateToc).toHaveBeenCalledTimes(1)
  expect(read("toc-generation")!.version).toBe(3)
})

it("regenerates only explicitly AI pages on an ordinary run and keeps protected neighbors exact", async () => {
  expect((await send("pages/pg001/sectioning", { ...read("page-sectioning", "pg001")!.data as object, baseVersion: 1 })).status).toBe(200)
  const protectedPage = read("page-sectioning", "pg001")
  const db = book()
  for (const stage of PIPELINE.filter((s) => s.name === "extract")) for (const step of stage.steps) db.markStepCompleted(step.name)
  db.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  db.close()
  sectionPage.mockImplementation(async ({ pageId }: { pageId: string }) => ({ reasoning: "new", sections: [section(pageId, "New")] }))
  expect((await run("sectioning")).status).toBe("completed")
  expect(sectionPage.mock.calls.map(([input]) => input.pageId).sort()).toEqual(["pg002", "pg003"])
  expect(read("page-sectioning", "pg001")).toEqual(protectedPage)
  expect(read("page-sectioning", "pg002")!.data).toMatchObject({ source: "ai", sections: [expect.objectContaining({ sectionId: "pg002_sec002" })] })
})

it("guards the queued AI edit at admission and publication and stamps its owning page manual", async () => {
  const tasks = createTaskService(bus, root)
  // Rendering screenshots are optional; use the real edit service and provider
  // adapter, without browser screenshots for this persistence regression.
  const taskApp = new Hono().use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createPageRoutes(root, prompts, "", configPath, tasks))
    .onError(errorHandler)
  const request = (baseVersion: number) => taskApp.request(`/books/${label}/pages/pg001/sections/0/ai-edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion, instruction: "Change text" }) })
  let complete = false
  const errors: string[] = []
  const dispose = bus.addListener(label, (event) => {
    if (event.type !== "task") return
    if (event.data.type === "task-complete") complete = true
    if (event.data.type === "task-error") errors.push(event.data.error)
  })
  generateObject.mockResolvedValueOnce({ object: { content: '<section><p data-id="pg001_t001">User requested edit</p></section>', reasoning: "Edited" } })
  expect((await request(0)).status).toBe(409)
  expect((await request(1)).status).toBe(200)
  await vi.waitFor(() => expect(complete).toBe(true))
  expect(errors).toEqual([])
  expect(read("page-sectioning", "pg001")!.data).toMatchObject({ source: "manual" })
  expect(JSON.stringify(read("web-rendering", "pg001")!.data)).toContain("User requested edit")
  const before = read("web-rendering", "pg001")
  let finish!: (value: unknown) => void
  generateObject.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  expect((await request(2)).status).toBe(200)
  await vi.waitFor(() => expect(finish).toBeDefined())
  // A writer outside this process is detected by the publication version check.
  const external = book(); external.putNodeData("page-sectioning", "pg001", read("page-sectioning", "pg001")!.data); external.close()
  finish({ object: { content: '<section><p>Stale model result</p></section>', reasoning: "" } })
  await vi.waitFor(() => expect(errors.join(" ")).toContain("Content changed"))
  expect(read("web-rendering", "pg001")).toEqual(before)
  dispose()
})
