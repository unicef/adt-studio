import { afterEach, beforeEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { unzipSync } from "fflate"
import { createBookStorage, extractionHash, readExtractionManifest, withBookWriter } from "@adt/storage"
import { extractPDF } from "@adt/pipeline"
import { ExtractionResumeBlockedSummary } from "@adt/types"
import { createStageRoutes, makeBeforeRun } from "./stages.js"
import { createBookEventBus, type BookSSEEvent } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService, type StageRunner } from "../services/stage-service.js"
import { createStageRunner } from "../services/stage-runner.js"
import { createFontRoutes } from "./fonts.js"
import { createTaskService } from "../services/task-service.js"
import { errorHandler } from "../middleware/error-handler.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { createZipStream } from "../services/zip-util.js"
import { exportProject } from "../services/export-service.js"
import { exportPart } from "../services/part-service.js"

const project = path.resolve(import.meta.dirname, "../../../..")
const pdf = path.join(project, "tests/fixtures/raven.pdf")
let root: string
let config: string
let book: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-api-admission-"))
  config = path.join(root, "base.yaml")
  book = path.join(root, "book")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\nstart_page: 1\nend_page: 1\n")
  fs.mkdirSync(book)
  fs.copyFileSync(pdf, path.join(book, "book.pdf"))
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

function setup(runner: StageRunner = createStageRunner()) {
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService(runner, bus, decisions)
  const app = new Hono()
  app.onError(errorHandler)
  app.use("/books/:label/*", bookWriterMiddleware(root))
  app.route("/", createStageRoutes(service, bus, decisions, root, path.join(project, "prompts"), path.join(project, "assets/adt"), config))
  const request = () => app.request("/books/book/stages/run", { method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "stub-secret" }, body: JSON.stringify({ fromStage: "extract", toStage: "extract" }) })
  return { app, bus, service, request }
}
async function extract() {
  const storage = createBookStorage("book", root)
  try { await extractPDF({ pdfPath: pdf, startPage: 1, endPage: 1 }, storage, { emit() {} }) }
  finally { storage.close() }
}
const options = () => ({ booksDir: root, configPath: config, credentials: {}, promptsDir: "", fromStage: "extract", toStage: "extract" })

it("HTTP and direct stage execution reject verified reuse before model transport or any content write", async () => {
  await extract()
  const db = path.join(book, "book.db")
  const before = extractionHash(fs.readFileSync(db))
  const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no provider work"))
  const s = setup()
  const response = await s.request()
  expect(response.status).toBe(409)
  const body = await response.json()
  expect(body).toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
  expect(ExtractionResumeBlockedSummary.parse(body.summary)).toEqual({
    kind: "admission-only", extraction: "verified-reusable", downstream: "blocked",
    scopeAssessment: "unavailable", generated: false, contentChanged: false,
  })
  await expect(createStageRunner().run("book", options(), { emit() {} })).rejects.toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
  expect(transport).not.toHaveBeenCalled()
  expect(extractionHash(fs.readFileSync(db))).toBe(before)
})

it("does not claim verified reuse when source validation fails", async () => {
  await extract()
  fs.appendFileSync(path.join(book, "book.pdf"), "changed source")
  const response = await setup().request()
  expect(response.status).toBe(409)
  const body = await response.json()
  expect(body.code).toBe("EXTRACTION_SOURCE_CHANGED")
  expect(body).not.toHaveProperty("summary")
})

it("a duplicate queued Extract job rechecks after its predecessor and never runs its clear callback", async () => {
  let finish!: () => void
  let started = false
  const runner: StageRunner = { async run() {
    await extract()
    started = true
    await new Promise<void>((resolve) => { finish = resolve })
  } }
  const { service } = setup(runner)
  service.startStageRun("book", options())
  await vi.waitFor(() => expect(started).toBe(true), { timeout: 10000 })
  const clear = vi.fn()
  expect(service.startStageRun("book", { ...options(), beforeRun: clear }).status).toBe("queued")
  const before = extractionHash(fs.readFileSync(path.join(book, "book.db")))
  finish()
  await vi.waitFor(() => expect(service.getStatus("book").active?.error).toContain("UNSAFE_RESUME_UNAVAILABLE"))
  expect(clear).not.toHaveBeenCalled()
  expect(extractionHash(fs.readFileSync(path.join(book, "book.db")))).toBe(before)
})

it("TaskService and interactive API writes cannot race a book writer, while cancellation stays reachable", async () => {
  const { app, bus } = setup()
  const events: BookSSEEvent[] = []
  bus.addListener("book", (event) => events.push(event))
  const tasks = createTaskService(bus, root)
  const executor = vi.fn(async () => "unexpected")
  let release!: () => void
  const holding = withBookWriter(book, () => new Promise<void>((resolve) => { release = resolve }))
  const write = vi.fn()
  app.put("/books/:label/edit", (c) => { write(); return c.json({ ok: true }) })
  tasks.submitTask("book", "prepare-export", "Competing task", executor)
  await vi.waitFor(() => expect(events.some((e) => e.type === "task" && e.data.type === "task-error")).toBe(true))
  const response = await app.request("/books/book/edit", { method: "PUT" })
  expect(response.status).toBe(409)
  expect(executor).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  const cancel = await app.request("/books/book/stages/cancel", { method: "POST" })
  expect(cancel.status).toBe(404)
  release()
  await holding
})

it("keeps legacy history, recordings and IDs even when the old Extract beforeRun callback is invoked directly", () => {
  const storage = createBookStorage("book", root)
  try {
    storage.putNodeData("page-sectioning", "pg001", { sectionId: "pg001_sec099" })
    storage.putNodeData("core-tts-catalog", "en", { mode: "manual" })
    storage.putSignLanguageVideo("video", Buffer.from("video-bytes"), "v.mp4", "video/mp4")
    storage.assignSignLanguageVideo("video", "pg001_sec099")
    const before = storage.getNodeVersionFingerprint()
    const callback = makeBeforeRun("book", "extract", "speech", root)
    callback(); callback()
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
    expect(storage.getSignLanguageVideos()[0].sectionId).toBe("pg001_sec099")
  } finally { storage.close() }
})

it("hides incomplete extraction from page readers but keeps diagnostics available", () => {
  const { app } = setup()
  fs.writeFileSync(path.join(book, "extraction.json"), "incomplete publication")
  const read = vi.fn()
  app.get("/books/:label/pages", (c) => { read(); return c.json([]) })
  return app.request("/books/book/pages").then((response) => {
    expect(response.status).toBe(409)
    expect(read).not.toHaveBeenCalled()
  })
})

it("project archives carry source, manifest, histories and referenced media without exporting writer ownership", async () => {
  await extract()
  fs.mkdirSync(path.join(book, "audio"))
  fs.writeFileSync(path.join(book, "audio/manual.mp3"), "manual recording")
  await withBookWriter(book, async () => {
    const archive = unzipSync(new Uint8Array(await new Response(createZipStream(book)).arrayBuffer()))
    for (const file of ["book.pdf", "book.db", "extraction.json", "audio/manual.mp3"]) expect(archive[file]).toBeDefined()
    expect(archive[".book-writer.json"]).toBeUndefined()
    expect(JSON.parse(Buffer.from(archive["extraction.json"]).toString())).toEqual(readExtractionManifest(book))
  })
})


it("does not create book directories for collection-level archive import endpoints", async () => {
  const app = new Hono()
  app.use("/books/:label", bookWriterMiddleware(root))
  app.post("/books/import", (c) => c.json({ imported: true }))
  app.post("/books/preview-import", (c) => c.json({ preview: true }))
  expect((await app.request("/books/import", { method: "POST" })).status).toBe(200)
  expect((await app.request("/books/preview-import", { method: "POST" })).status).toBe(200)
  expect(fs.existsSync(path.join(root, "import"))).toBe(false)
  expect(fs.existsSync(path.join(root, "preview-import"))).toBe(false)
})


it.each(["book", "%62ook", "b%6Fok"])("blocks incomplete page reads through the %s URL spelling", async (label) => {
  const { app } = setup()
  fs.writeFileSync(path.join(book, "extraction.json"), "incomplete publication")
  const read = vi.fn()
  app.get("/books/:label/pages", (c) => { read(); return c.json([]) })
  expect((await app.request(`/books/${label}/pages`)).status).toBe(409)
  expect(read).not.toHaveBeenCalled()
})

it("rejects GET archive work before the handler can write a part ledger while a writer is active", async () => {
  const { app } = setup()
  const ledger = path.join(book, "parts-ledger.json")
  app.get("/books/:label/export-part", (c) => c.body(exportPart("book", root, { startPage: 1, endPage: 1 }, config).stream))
  let release!: () => void
  const holding = withBookWriter(book, () => new Promise<void>((resolve) => { release = resolve }))
  try {
    expect((await app.request("/books/book/export-part")).status).toBe(409)
    expect(fs.existsSync(ledger)).toBe(false)
  } finally { release(); await holding }
  const admitted = await app.request("/books/book/export-part")
  expect(admitted.status).toBe(200)
  await admitted.arrayBuffer()
  expect(fs.existsSync(ledger)).toBe(true)
})

it.each([false, true])("retains archive admission through asynchronous reads (cancelled=%s)", async (cancelled) => {
  await extract()
  // The real ZIP producer yields after 50 files, after the HTTP handler returns.
  for (let i = 0; i < 110; i++) fs.writeFileSync(path.join(book, `retained-${i}.txt`), `manual-${i}`)
  const { app } = setup()
  app.get("/books/:label/export-project", async (c) => c.body((await exportProject("book", root)).stream))
  vi.useFakeTimers()
  try {
    const response = await app.request("/books/book/export-project")
    expect(response.status).toBe(200)
    expect(() => withBookWriter(book, () => "racing edit")).toThrow("BOOK_BUSY")
    const result = cancelled ? response.body!.cancel() : response.arrayBuffer()
    // Cancelling the consumer must not release admission while the eager
    // producer is still reading files to finish or discard the archive.
    expect(() => withBookWriter(book, () => "racing edit")).toThrow("BOOK_BUSY")
    await vi.runAllTimersAsync()
    const bytes = await result
    if (!cancelled) {
      const archive = unzipSync(new Uint8Array(bytes as ArrayBuffer))
      expect(Buffer.from(archive["retained-109.txt"]).toString()).toBe("manual-109")
      expect(archive["extraction.json"]).toBeDefined()
      expect(archive[".book-writer.json"]).toBeUndefined()
    }
    expect(withBookWriter(book, () => "released")).toBe("released")
  } finally { await vi.runAllTimersAsync(); vi.useRealTimers() }
})


it("releases archive admission after a source read fails", async () => {
  const { app } = setup()
  let fail!: () => void
  app.get("/books/:label/export-project", (c) => c.body(new ReadableStream({
    start(controller) { fail = () => controller.error(new Error("disk read failed")) },
  })))
  const response = await app.request("/books/book/export-project")
  expect(() => withBookWriter(book, () => "racing edit")).toThrow("BOOK_BUSY")
  const rejected = expect(response.arrayBuffer()).rejects.toThrow("disk read failed")
  fail()
  await rejected
  expect(withBookWriter(book, () => "released")).toBe("released")
})

it("initial HTTP execution publishes extraction and retains it when cancelled before provider work", async () => {
  const { bus, service, request } = setup()
  const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no provider work"))
  let published = false
  let cancelled = false
  bus.addListener("book", (event) => {
    if (event.type === "stage-run-cancelled") cancelled = true
    if (event.type === "progress" && event.data.type === "step-complete" && event.data.step === "extract") {
      published = readExtractionManifest(book)?.status === "complete"
      service.cancelStageRun("book")
    }
  })
  expect((await request()).status).toBe(200)
  await vi.waitFor(() => expect(cancelled).toBe(true), { timeout: 15000 })
  expect(published).toBe(true)
  expect(transport).not.toHaveBeenCalled()
  const storage = createBookStorage("book", root)
  try {
    expect(storage.getPages().map((page) => page.pageId)).toEqual(["pg001"])
    expect(storage.getStepRuns()).toContainEqual(expect.objectContaining({ step: "extract", status: "done" }))
    expect(await extractPDF({ pdfPath: pdf, startPage: 1, endPage: 1 }, storage, { emit() {} })).toBe("reused")
  } finally { storage.close() }
})


it("admits first extraction after a real font upload without changing its registry or bytes", async () => {
  const { app } = setup()
  app.route("/", createFontRoutes(root, path.join(project, "prompts"), config))
  const form = new FormData()
  const fontBytes = fs.readFileSync(path.join(project, "assets/adt/fonts/Merriweather-VariableFont.woff2"))
  form.append("fonts", new File([new Uint8Array(fontBytes)], "custom.woff2"))
  const uploaded = await app.request("/books/book/fonts", { method: "POST", body: form })
  expect(uploaded.status).toBe(200)
  const storage = createBookStorage("book", root)
  try {
    const registry = storage.getAllNodeVersions("font-registry", "book")
    const fonts = fs.readdirSync(path.join(book, "fonts"))
    expect(fonts).toHaveLength(1)
    expect(await extractPDF({ pdfPath: pdf, startPage: 1, endPage: 1 }, storage, { emit() {} })).toBe("extracted")
    expect(storage.getAllNodeVersions("font-registry", "book")).toEqual(registry)
    expect(fs.readFileSync(path.join(book, "fonts", fonts[0]))).toEqual(fontBytes)
  } finally { storage.close() }
})
