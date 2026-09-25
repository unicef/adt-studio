import { afterEach, beforeEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { unzipSync } from "fflate"
import { createBookStorage, extractionHash, readExtractionManifest, withBookWriter } from "@adt/storage"
import { extractPDF } from "@adt/pipeline"
import { createStageRoutes, makeBeforeRun } from "./stages.js"
import { createBookEventBus, type BookSSEEvent } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService, type StageRunner } from "../services/stage-service.js"
import { createStageRunner } from "../services/stage-runner.js"
import { createTaskService } from "../services/task-service.js"
import { errorHandler } from "../middleware/error-handler.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { createZipStream } from "../services/zip-util.js"

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
  expect(await response.json()).toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
  await expect(createStageRunner().run("book", options(), { emit() {} })).rejects.toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
  expect(transport).not.toHaveBeenCalled()
  expect(extractionHash(fs.readFileSync(db))).toBe(before)
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
