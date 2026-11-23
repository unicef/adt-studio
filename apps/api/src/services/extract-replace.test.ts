import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

interface StubImage { imageId: string; width: number; height: number }
interface StubRequest { log?: { taskType?: string }; context?: { images?: StubImage[] } }
const stub = vi.hoisted(() => ({ calls: [] as string[], failReset: false }))
vi.mock("@adt/llm", async original => ({
  ...await original<typeof import("@adt/llm")>(),
  createLLMModel: () => ({
    async generateObject(request: StubRequest) {
      const task = request.log?.taskType ?? "unknown"
      stub.calls.push(task)
      const each = <T>(result: T) => ({ object: { images: (request.context?.images ?? []).map(image => ({ image_id: image.imageId, reasoning: "stub", ...result })) } })
      if (task === "metadata") return { object: { title: "Raven", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "stub" } }
      if (task === "book-summary") return { object: { summary: "A stub summary." } }
      if (task === "image-meaningfulness") return each({ is_meaningful: true })
      if (task === "image-segmentation") return each({ needs_segmentation: false, segments: [] })
      if (task === "image-cropping") return each({ should_crop: false, crop_left: 0, crop_top: 0, crop_right: 1, crop_bottom: 1 })
      throw new Error(`Unexpected provider call: ${task}`)
    },
  }),
}))
vi.mock("@adt/pipeline", async original => ({
  ...await original<typeof import("@adt/pipeline")>(),
  generateBookOutline: async () => { stub.calls.push("book-outline"); return { entries: [] } },
}))
vi.mock("@adt/storage", async original => {
  const real = await original<typeof import("@adt/storage")>()
  return { ...real, createBookStorage: (...args: Parameters<typeof real.createBookStorage>) => {
    const storage = real.createBookStorage(...args)
    const reset = storage.resetExtractData?.bind(storage)
    if (reset) storage.resetExtractData = () => { if (stub.failReset) throw new Error("fault after the record was written"); reset() }
    return storage
  } }
})

import { createBookStorage, openBookDb } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { ExtractRerunDiscards, FONT_REGISTRY_NODE, PIPELINE, PROJECT_IDENTITY_FILE, type ExtractRerunRequest, type ExtractRerunStatus } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"
import { createStageService, type StageRunner } from "./stage-service.js"
import { createBookEventBus, type BookSSEEvent } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import { createBook } from "./book-service.js"
import { createStageRoutes, makeBeforeRun } from "../routes/stages.js"
import { errorHandler } from "../middleware/error-handler.js"

const repo = path.resolve(import.meta.dirname, "../../../..")
const label = "book"
const extractSteps = PIPELINE.find(stage => stage.name === "extract")!.steps.map(step => step.name)
const config = 'structure_types: {}\nrole_types: {}\ndefault_model: "ollama:llama3"\nconcurrency: 1\nimage_filters:\n  segmentation: true\n  cropping: true\n'
const dirs: string[] = []
let template: string

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "extract-replace-"))
  dirs.push(root)
  fs.writeFileSync(path.join(root, "config.yaml"), config)
  return root
}
const runOptions = (root: string, extraction?: ExtractRerunRequest) => ({
  booksDir: root, promptsDir: root, configPath: path.join(root, "config.yaml"), credentials: {}, fromStage: "extract", toStage: "extract", extraction,
})

/** A real, complete first Extract run of pages 1–2 with nothing after it (case C). */
beforeAll(async () => {
  template = tempRoot()
  createBook(label, fs.readFileSync(path.join(repo, "tests/fixtures/raven.pdf")), template, { start_page: 1, end_page: 2 })
  await createStageRunner().run(label, runOptions(template), { emit() {} })
}, 120_000)
beforeEach(() => { stub.calls.length = 0; stub.failReset = false })
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) })

interface Book {
  root: string
  dir: string
  record(): { attemptId: string; status: string; inputs: { startPage: number; endPage: number }; pages: unknown[] }
  read<T>(use: (storage: Storage) => T): T
  rows<T = Record<string, unknown>>(sql: string): T[]
  exec(sql: string): void
}
function book(): Book {
  const root = tempRoot()
  const dir = path.join(root, label)
  fs.cpSync(path.join(template, label), dir, { recursive: true })
  const db = <T>(use: (db: ReturnType<typeof openBookDb>) => T): T => { const handle = openBookDb(path.join(dir, `${label}.db`)); try { return use(handle) } finally { handle.close() } }
  return {
    root, dir,
    record: () => JSON.parse(fs.readFileSync(path.join(dir, "extraction.json"), "utf8")),
    read: use => { const storage = createBookStorage(label, root); try { return use(storage) } finally { storage.close() } },
    rows: sql => db(handle => handle.all(sql)) as never,
    exec: sql => db(handle => { handle.exec(sql) }),
  }
}
const statuses = (b: Book) => Object.fromEntries(b.read(storage => storage.getStepRuns()).map(run => [run.step, run.status]))
const allDone = Object.fromEntries(extractSteps.map(step => [step, "done"]))
const count = (b: Book, table: string) => b.rows<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)[0].n
const pageNumbers = (b: Book) => b.read(storage => storage.getPages().map(page => page.pageNumber))
/** The writer lease of a run that has just settled is not book content. */
const listing = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(entry => !entry.name.startsWith(".book-writer") && !entry.name.endsWith(".lock"))
  .map(entry => path.join(entry.parentPath, entry.name)).sort()
const snapshot = (b: Book) => ({
  db: createHash("sha256").update(fs.readFileSync(path.join(b.dir, `${label}.db`))).digest("hex"),
  record: fs.existsSync(path.join(b.dir, "extraction.json")) ? fs.readFileSync(path.join(b.dir, "extraction.json"), "utf8") : null,
  files: listing(b.dir),
})
const setWindow = (b: Book, startPage: number, endPage: number) => {
  const file = path.join(b.dir, "config.yaml")
  const text = fs.readFileSync(file, "utf8")
  expect(text).toMatch(/^start_page: 1$/m)
  fs.writeFileSync(file, text.replace(/^start_page: 1$/m, `start_page: ${startPage}`).replace(/^end_page: 2$/m, `end_page: ${endPage}`))
}
const makePart = (b: Book) => fs.writeFileSync(path.join(b.dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null,
  range: { startPage: 1, endPage: 2 }, pageCount: 12, fingerprint: null, identityHash: "a", semanticsHash: "b",
  createdAt: "2026-01-01T00:00:00.000Z", partLabelSuggestion: "source-part-1" }))
function server(root: string, runner: StageRunner = createStageRunner()) {
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService(runner, bus, decisions)
  const app = new Hono().onError(errorHandler)
    .route("/", createStageRoutes(service, bus, decisions, root, root, root, path.join(root, "config.yaml")))
  const post = (body: unknown) => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const status = async () => await (await app.request(`/books/${label}/step-status`)).json() as { extractRerun: ExtractRerunStatus; extractRerunDiscards: unknown }
  const offered = async () => (await status()).extractRerun
  /** Post a run and wait for it to settle. */
  const run = async (body: unknown): Promise<BookSSEEvent> => {
    const settled = new Promise<BookSSEEvent>(resolve => {
      const stop = bus.addListener(label, event => {
        if (event.type === "stage-run-complete" || event.type === "stage-run-error") { stop(); resolve(event) }
      })
    })
    const response = await post(body)
    expect(response.status, await response.clone().text()).toBe(200)
    return settled
  }
  return { app, bus, service, post, status, offered, run }
}
const extractRun = (action: string, attemptId: string | null) => ({ fromStage: "extract", toStage: "extract", extraction: { action, attemptId } })
const replace = (attemptId: string | null) => extractRun("replace", attemptId)
const refusal = async (response: Response) => ({ status: response.status, ...(await response.json() as { code?: string; error: string }) })
/** The request is refused by the route, by the queued-run preparation and by the runner, and changes nothing. */
async function refusedEverywhere(b: Book, attemptId: string | null, code: string, message = /./): Promise<void> {
  const before = snapshot(b)
  const { post, service } = server(b.root)
  const body = await refusal(await post(replace(attemptId)))
  expect(body).toMatchObject({ status: 409, code })
  expect(body.error).toMatch(message)
  expect(service.getStatus(label).active).toBeNull()
  expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"), { action: "replace", attemptId })()).toThrow(code)
  await expect(createStageRunner().run(label, runOptions(b.root, { action: "replace", attemptId }), { emit() {} })).rejects.toMatchObject({ code })
  expect(snapshot(b)).toEqual(before)
  expect(stub.calls).toEqual([])
}

describe("SPEC-0003 Extract replace", { timeout: 60_000 }, () => {
  it("RAC-23: replace extracts again with the current settings", async () => {
    const b = book()
    const first = b.record()
    expect(first).toMatchObject({ status: "complete", inputs: { startPage: 1, endPage: 2 } })
    expect(pageNumbers(b)).toEqual([1, 2])
    expect(statuses(b)).toEqual(allDone)
    const { offered, run } = server(b.root)
    expect(await offered()).toEqual({ actions: ["replace"], attemptId: first.attemptId, blockedReason: null })

    // The user's case: nothing but Extract ran, and the page range changes.
    setWindow(b, 3, 5)
    expect(await offered()).toEqual({ actions: ["replace"], attemptId: first.attemptId, blockedReason: null })
    expect(await run(replace(first.attemptId))).toEqual({ type: "stage-run-complete", label })

    const record = b.record()
    expect(record).toMatchObject({ status: "complete", inputs: { startPage: 3, endPage: 5 } })
    expect(record.attemptId).not.toBe(first.attemptId)
    expect(record.pages).toHaveLength(3)
    expect(pageNumbers(b)).toEqual([3, 4, 5])
    expect(b.rows<{ page_id: string }>("SELECT DISTINCT page_id FROM images ORDER BY page_id").map(row => row.page_id)).toEqual(b.read(storage => storage.getPages().map(page => page.pageId)))
    expect(fs.readdirSync(path.join(b.dir, "images")).sort()).toEqual(b.rows<{ path: string }>("SELECT path FROM images").map(row => path.basename(row.path)).sort())
    expect(statuses(b)).toEqual(allDone)
    expect(stub.calls).toEqual(expect.arrayContaining(["metadata", "book-summary", "book-outline", "image-meaningfulness", "image-segmentation", "image-cropping"]))
    expect(await offered()).toEqual({ actions: ["replace"], attemptId: record.attemptId, blockedReason: null })
  })

  it("RAC-23: fonts, typography, configuration, LLM log and cache survive a replace", async () => {
    const b = book()
    b.read(storage => {
      storage.putNodeData(FONT_REGISTRY_NODE, "book", { fonts: [{ id: "custom", family: "Custom", source: "upload", faces: [{ weight: 400, style: "normal", file: "custom.woff2", format: "woff2" }] }] })
      storage.putNodeData("font-assignment", "book", { roles: {} })
      storage.putNodeData("typography", "book", { roles: {} })
      // Edits made in Extract: they belong to the extraction that is replaced.
      storage.putNodeData("metadata", "book", { title: "Edited by hand", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "" })
      storage.putCroppedImage({ imageId: "pg001_im001", pageId: "pg001", version: 7, buffer: Buffer.from("png"), width: 4, height: 4 })
    })
    b.exec("INSERT INTO llm_log (timestamp, step, data) VALUES ('2026-01-01T00:00:00.000Z', 'metadata', '{}')")
    const files: Record<string, string> = {
      "fonts/custom.woff2": "font", "styleguides/book-generated.md": "# Guide", "templates/two_column.liquid": "<section></section>",
      "prompts/metadata.liquid": "prompt", ".cache/entry.json": "{}",
    }
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(b.dir, file)), { recursive: true })
      fs.writeFileSync(path.join(b.dir, file), content)
    }
    const kept = () => ({
      nodes: b.rows("SELECT node, item_id, version, data FROM node_data WHERE node IN ('font-registry', 'font-assignment', 'typography') ORDER BY node"),
      log: b.rows("SELECT step, data FROM llm_log"),
      files: Object.fromEntries([...Object.keys(files), `${label}.pdf`, "config.yaml", PROJECT_IDENTITY_FILE].map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(b.dir, file))).digest("hex")])),
    })
    const before = kept()
    expect(before.nodes).toHaveLength(3)
    const crop = b.rows<{ path: string }>("SELECT path FROM images WHERE source = 'crop'")
    expect(crop).toHaveLength(1)

    const { run } = server(b.root)
    expect(await run(replace(b.record().attemptId))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(kept()).toEqual(before)
    expect(b.rows("SELECT 1 FROM images WHERE source = 'crop'")).toEqual([])
    expect(fs.existsSync(path.join(b.dir, crop[0].path))).toBe(false)
    expect(b.read(storage => storage.getLatestNodeData("metadata", "book")?.data)).toMatchObject({ title: "Raven" })
    expect(statuses(b)).toEqual(allDone)
  })

  it("RAC-23: replace with an old attemptId is refused", async () => {
    const b = book()
    const old = b.record().attemptId
    await refusedEverywhere(b, "00000000-0000-4000-8000-000000000000", "EXTRACTION_RERUN_STALE")
    await refusedEverywhere(b, null, "EXTRACTION_RERUN_STALE")
    // The attempt a confirmation was shown for is gone once the book is extracted again.
    expect(await server(b.root).run(replace(old))).toEqual({ type: "stage-run-complete", label })
    stub.calls.length = 0
    await refusedEverywhere(b, old, "EXTRACTION_RERUN_STALE", /^EXTRACTION_RERUN_STALE: (?!.*(fresh|pnpm pipeline))/)
  })

  it("RAC-23: replace is refused on a part book", async () => {
    const b = book()
    makePart(b)
    expect(await server(b.root).status()).toMatchObject({ extractRerun: { actions: [], blockedReason: "part-book" }, extractRerunDiscards: null })
    await refusedEverywhere(b, b.record().attemptId, "EXTRACTION_RERUN_STALE")
    // A part with unfinished Extract steps resumes; it still cannot be replaced.
    b.read(storage => storage.clearStepRuns(["image-cropping"]))
    expect(await server(b.root).offered()).toMatchObject({ actions: ["resume"] })
    await refusedEverywhere(b, b.record().attemptId, "EXTRACTION_RERUN_STALE")
  })

  it("RAC-23: replace is never queued", async () => {
    const b = book()
    let finish = () => {}
    let entered = () => {}
    const running = new Promise<void>(resolve => { entered = resolve })
    const blocked: StageRunner = { run: () => new Promise<void>(resolve => { finish = resolve; entered() }) }
    const { post, service, bus } = server(b.root, blocked)
    const settled = new Promise<void>(resolve => bus.addListener(label, event => { if (event.type === "stage-run-complete") resolve() }))
    const before = snapshot(b)
    // Another stage's run occupies the book, held at the runner before it changes anything.
    expect(service.startStageRun(label, { ...runOptions(b.root), fromStage: "package", toStage: "package" }).status).toBe("started")
    await running
    for (const action of ["replace", "retry"]) {
      expect(await refusal(await post(extractRun(action, b.record().attemptId)))).toMatchObject({ status: 409, code: "EXTRACTION_RERUN_STALE" })
      expect(service.getStatus(label).queue).toEqual([])
    }
    // A resume keeps the ordinary queue: it is re-checked when it starts.
    expect(service.getStatus(label).active).toMatchObject({ fromStage: "package", status: "running" })
    expect(snapshot(b)).toEqual(before)
    finish()
    await settled
    expect(snapshot(b)).toEqual(before)
  })

  it("RAC-23: replace is refused once Sectioning or later output exists", async () => {
    const sectioned = book()
    sectioned.read(storage => storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [] }))
    const later = book()
    later.read(storage => storage.markStepCompleted("tts"))
    for (const [b, message] of [[sectioned, /Full extraction reruns cannot safely reconcile existing Sectioning/], [later, /Re-extraction of an existing book/]] as const) {
      expect(await server(b.root).status()).toMatchObject({ extractRerun: { actions: [], blockedReason: "downstream-output" }, extractRerunDiscards: null })
      await refusedEverywhere(b, b.record().attemptId, "SECTIONING_REGENERATION_BLOCKED", message)
    }
  })

  it("RAC-23: replace works on an older book without an extraction record", async () => {
    const b = book()
    fs.rmSync(path.join(b.dir, "extraction.json"))
    const { offered, run } = server(b.root)
    expect(await offered()).toEqual({ actions: ["replace"], attemptId: null, blockedReason: null })
    await refusedEverywhere(b, "00000000-0000-4000-8000-000000000000", "EXTRACTION_RERUN_STALE")
    setWindow(b, 2, 2)
    expect(await run(replace(null))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete", inputs: { startPage: 2, endPage: 2 } })
    expect(pageNumbers(b)).toEqual([2])
    expect(statuses(b)).toEqual(allDone)
  })

  it("RAC-23: an interrupted replace leaves a book that can be retried", async () => {
    const b = book()
    const first = b.record()
    const { offered, run } = server(b.root)
    stub.failReset = true
    expect((await run(replace(first.attemptId))).type).toBe("stage-run-error")
    // The usable extraction was given up at the first change, and its data is still there.
    expect(b.record()).toMatchObject({ status: "failed", attemptId: first.attemptId })
    expect(pageNumbers(b)).toEqual([1, 2])
    expect(await offered()).toEqual({ actions: ["retry"], attemptId: first.attemptId, blockedReason: null })
    await refusedEverywhere(b, first.attemptId, "EXTRACTION_RERUN_STALE")
    stub.failReset = false
    expect(await run(extractRun("retry", first.attemptId))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(statuses(b)).toEqual(allDone)
  })

  it("RAC-24: step-status reports what a replace discards", async () => {
    const b = book()
    const discards = async () => {
      const value = (await server(b.root).status()).extractRerunDiscards
      return value === null ? null : ExtractRerunDiscards.parse(value)
    }
    const extracted = count(b, "images")
    expect(extracted).toBeGreaterThan(2)
    expect(await discards()).toEqual({ pages: 2, extractedImages: extracted, addedImages: 0 })
    // A crop, a segment and an upload made in Extract.
    b.read(storage => {
      storage.putCroppedImage({ imageId: "pg001_im001", pageId: "pg001", version: 1, buffer: Buffer.from("png"), width: 4, height: 4 })
      storage.putSegmentedImage({ sourceImageId: "pg001_im001", segmentIndex: 1, pageId: "pg001", version: 1, buffer: Buffer.from("png"), width: 4, height: 4 })
    })
    b.exec("INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES ('pg001_upload001', 'pg001', 'images/pg001_upload001.png', 'h', 4, 4, 'upload')")
    fs.writeFileSync(path.join(b.dir, "images", "pg001_upload001.png"), "png")
    expect(await discards()).toEqual({ pages: 2, extractedImages: extracted, addedImages: 3 })
    // Offered together with resume, and for an older book without a record.
    b.read(storage => storage.recordStepError("book-summary", "provider failed"))
    expect(await server(b.root).offered()).toMatchObject({ actions: ["resume", "replace"] })
    expect(await discards()).toEqual({ pages: 2, extractedImages: extracted, addedImages: 3 })
    // Nothing is counted when a replace is not offered.
    const record = path.join(b.dir, "extraction.json")
    fs.writeFileSync(record, JSON.stringify({ ...b.record(), status: "failed" }))
    expect(await server(b.root).offered()).toMatchObject({ actions: ["retry"] })
    expect(await discards()).toBeNull()
    expect(await (await server(tempRoot()).app.request("/books/missing/step-status")).json()).toMatchObject({ extractRerunDiscards: null })
  })
})
