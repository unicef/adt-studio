import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

interface StubImage { imageId: string; width: number; height: number }
interface StubRequest { log?: { taskType?: string }; context?: { images?: StubImage[] } }
type Fault = "after-record" | "after-files" | "leftover-file" | "extracting"
const stub = vi.hoisted(() => ({ calls: [] as string[], fault: null as Fault | null }))
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
/** Fault injection at the reset steps (SPEC-0003 "Reset order"): after the
 * record is written as failed, after the image files are deleted, a file the
 * post-reset check must find, and while pages are being extracted. */
vi.mock("@adt/storage", async original => {
  const real = await original<typeof import("@adt/storage")>()
  return { ...real, createBookStorage: (...args: Parameters<typeof real.createBookStorage>) => {
    const storage = real.createBookStorage(...args)
    const reset = storage.resetExtractData?.bind(storage)
    if (reset) storage.resetExtractData = () => {
      if (stub.fault === "after-record") throw new Error("fault after the record was written")
      reset()
      if (stub.fault === "after-files") throw new Error("fault after the files were deleted")
      if (stub.fault === "leftover-file") fs.writeFileSync(path.join(storage.bookDir!, "images", "leftover.png"), "png")
    }
    const put = storage.putExtractedPage.bind(storage)
    storage.putExtractedPage = page => { put(page); if (stub.fault === "extracting") throw new Error("fault while extracting") }
    return storage
  } }
})

import { createBookStorage, openBookDb, writeSectioningLifecycle } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { FONT_REGISTRY_NODE, PIPELINE, PROJECT_IDENTITY_FILE, type ExtractRerunRequest, type ExtractRerunStatus } from "@adt/types"
import { canonicalJson, computeFingerprint, hashPdfBytes, type PipelineFingerprint } from "@adt/types/fingerprint"
import { loadBookConfig } from "@adt/pipeline"
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
const incomplete = "EXTRACTION_INCOMPLETE: Extraction is incomplete or failed; its partial data has been retained. Use a fresh, user-chosen label: pnpm pipeline <new-label> <pdf-file> [options]."
const dirs: string[] = []
let template: string

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "extract-retry-"))
  dirs.push(root)
  fs.writeFileSync(path.join(root, "config.yaml"), config)
  return root
}
const runOptions = (root: string, extraction?: ExtractRerunRequest) => ({
  booksDir: root, promptsDir: root, configPath: path.join(root, "config.yaml"), credentials: {}, fromStage: "extract", toStage: "extract", extraction,
})

/** A real first Extract run of two pages that fails while the first page is
 * stored (case A): the record is `failed` and one page with its images remains. */
beforeAll(async () => {
  template = tempRoot()
  createBook(label, fs.readFileSync(path.join(repo, "tests/fixtures/raven.pdf")), template, { start_page: 1, end_page: 2 })
  stub.fault = "extracting"
  await expect(createStageRunner().run(label, runOptions(template), { emit() {} })).rejects.toThrow("fault while extracting")
}, 120_000)
beforeEach(() => { stub.calls.length = 0; stub.fault = null })
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) })

interface Book {
  root: string
  dir: string
  record(): { attemptId: string; status: string; sourceHash: string; pages: unknown[] }
  /** The retry request Studio would send for the book as it is now. */
  retry(): ExtractRerunRequest
  read<T>(use: (storage: Storage) => T): T
  rows<T = Record<string, unknown>>(sql: string): T[]
  exec(sql: string): void
}
function book(): Book {
  const root = tempRoot()
  const dir = path.join(root, label)
  fs.cpSync(path.join(template, label), dir, { recursive: true })
  const db = <T>(use: (db: ReturnType<typeof openBookDb>) => T): T => { const handle = openBookDb(path.join(dir, `${label}.db`)); try { return use(handle) } finally { handle.close() } }
  const record = () => JSON.parse(fs.readFileSync(path.join(dir, "extraction.json"), "utf8"))
  const read: Book["read"] = use => { const storage = createBookStorage(label, root); try { return use(storage) } finally { storage.close() } }
  return {
    root, dir, record, read,
    retry: () => {
      let attemptId: string | null = null
      try { attemptId = record().attemptId } catch { /* an unreadable record binds null */ }
      return { action: "retry", attemptId, contentToken: read(storage => storage.readExtractContentToken!()) }
    },
    rows: sql => db(handle => handle.all(sql)) as never,
    exec: sql => db(handle => { handle.exec(sql) }),
  }
}
const statuses = (b: Book) => Object.fromEntries(b.read(storage => storage.getStepRuns()).map(run => [run.step, run.status]))
const allDone = Object.fromEntries(extractSteps.map(step => [step, "done"]))
const count = (b: Book, table: string) => b.rows<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)[0].n
/** The writer lease of a run that has just settled is not book content. */
const listing = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(entry => !entry.name.startsWith(".book-writer") && !entry.name.endsWith(".lock"))
  .map(entry => path.join(entry.parentPath, entry.name)).sort()
const snapshot = (b: Book) => ({
  db: createHash("sha256").update(fs.readFileSync(path.join(b.dir, `${label}.db`))).digest("hex"),
  record: fs.readFileSync(path.join(b.dir, "extraction.json"), "utf8"),
  files: listing(b.dir),
})
function server(root: string, runner: StageRunner = createStageRunner()) {
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService(runner, bus, decisions)
  const app = new Hono().onError(errorHandler)
    .route("/", createStageRoutes(service, bus, decisions, root, root, root, path.join(root, "config.yaml")))
  const post = (body: unknown) => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const offered = async () => (await (await app.request(`/books/${label}/step-status`)).json() as { extractRerun: ExtractRerunStatus }).extractRerun
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
  return { app, bus, service, post, offered, run }
}
const extractRun = (extraction?: unknown) => ({ fromStage: "extract", toStage: "extract", ...(extraction ? { extraction } : {}) })
const digest = expect.stringMatching(/^[a-f0-9]{64}$/)
const partManifest = (identityHash: string, fingerprint: unknown = null) => JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null, range: { startPage: 1, endPage: 2 }, pageCount: 3, fingerprint,
  identityHash, semanticsHash: "b", createdAt: "2026-01-01T00:00:00.000Z", partLabelSuggestion: "source-part-1" })
/** The fingerprint the coordinator's merge gate computes for this book now. */
const mergeFingerprint = (b: Book) => computeFingerprint({
  config: loadBookConfig(label, b.root, path.join(b.root, "config.yaml")), pdfSha256: hashPdfBytes(fs.readFileSync(path.join(b.dir, `${label}.pdf`))),
})
const mergeIdentity = (b: Book) => mergeFingerprint(b).identityHash
/** The same fingerprint as an app with the previous database schema wrote it at export. */
const underOlderSchema = (fingerprint: PipelineFingerprint): PipelineFingerprint => {
  const identity = { ...fingerprint.identity, schemaVersion: fingerprint.identity.schemaVersion - 1 }
  return { ...fingerprint, identity, identityHash: createHash("sha256").update(canonicalJson(identity)).digest("hex") }
}
const refusal = async (response: Response) => ({ status: response.status, ...(await response.json() as { code?: string; error: string }) })

describe("SPEC-0003 Extract retry", { timeout: 60_000 }, () => {
  it("RAC-22: retry discards the failed attempt and extracts again", async () => {
    const b = book()
    const failed = b.record()
    expect(failed.status).toBe("failed")
    expect(b.read(storage => storage.getPages()).map(page => page.pageId)).toEqual(["pg001"])
    // Leftovers of the failed attempt, and what a retry keeps.
    b.read(storage => {
      storage.putNodeData("extraction-debug", "pg999", { stale: true })
      storage.putNodeData("typography", "book", { roles: {} })
    })
    b.exec("INSERT INTO llm_log (timestamp, step, data) VALUES ('2026-01-01T00:00:00.000Z', 'metadata', '{}')")
    fs.writeFileSync(path.join(b.dir, "images", "stale-partial.png"), "png")
    fs.writeFileSync(path.join(b.dir, ".debug-images", "0123456789abcdef.png"), "png")
    fs.mkdirSync(path.join(b.dir, ".cache"), { recursive: true })
    fs.writeFileSync(path.join(b.dir, ".cache", "entry.json"), "{}")
    const kept = { pdf: fs.readFileSync(path.join(b.dir, `${label}.pdf`)), config: fs.readFileSync(path.join(b.dir, "config.yaml")), identity: fs.readFileSync(path.join(b.dir, PROJECT_IDENTITY_FILE)) }

    const { offered, run } = server(b.root)
    expect(await offered()).toEqual({ actions: ["retry"], attemptId: failed.attemptId, contentToken: digest, blockedReason: null })
    expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })

    const record = b.record()
    expect(record.status).toBe("complete")
    expect(record.attemptId).not.toBe(failed.attemptId)
    expect(record.sourceHash).toBe(failed.sourceHash)
    expect(record.pages).toHaveLength(2)
    expect(b.read(storage => storage.getPages()).map(page => page.pageId)).toEqual(["pg001", "pg002"])
    expect(count(b, "images")).toBeGreaterThan(2)
    for (const image of b.rows<{ path: string }>("SELECT path FROM images")) expect(fs.existsSync(path.join(b.dir, image.path)), image.path).toBe(true)
    // Every Extract step ran, as on a first extraction.
    expect(statuses(b)).toEqual(allDone)
    expect(stub.calls).toEqual(expect.arrayContaining(["metadata", "book-summary", "book-outline", "image-meaningfulness"]))
    // The failed attempt's rows and files are gone.
    expect(b.rows("SELECT 1 FROM node_data WHERE item_id = 'pg999'")).toEqual([])
    expect(fs.existsSync(path.join(b.dir, "images", "stale-partial.png"))).toBe(false)
    expect(fs.readdirSync(path.join(b.dir, ".debug-images"))).toEqual([])
    // Configuration, diagnostics and cache are kept.
    expect(b.rows("SELECT step, data FROM llm_log")).toEqual([{ step: "metadata", data: "{}" }])
    expect(b.read(storage => storage.getLatestNodeData("typography", "book"))).toEqual({ version: 1, data: { roles: {} } })
    expect(fs.readFileSync(path.join(b.dir, ".cache", "entry.json"), "utf8")).toBe("{}")
    expect(fs.readFileSync(path.join(b.dir, `${label}.pdf`)).equals(kept.pdf)).toBe(true)
    expect(fs.readFileSync(path.join(b.dir, "config.yaml")).equals(kept.config)).toBe(true)
    expect(fs.readFileSync(path.join(b.dir, PROJECT_IDENTITY_FILE)).equals(kept.identity)).toBe(true)
    expect(await offered()).toMatchObject({ actions: ["replace"], attemptId: record.attemptId })
  })

  it.each<Fault | "transaction">(["after-record", "transaction", "after-files", "leftover-file", "extracting"])(
    "RAC-22: a fault at each reset step leaves a retryable book (%s)", async point => {
      const b = book()
      const before = { attemptId: b.record().attemptId, pages: count(b, "pages"), images: count(b, "images"), nodes: count(b, "node_data") }
      const { offered, run } = server(b.root)
      // A fault inside the transaction: the page delete aborts after the node and image deletes ran.
      if (point === "transaction") b.exec("CREATE TRIGGER fault_reset BEFORE DELETE ON pages BEGIN SELECT RAISE(ABORT, 'fault in the transaction'); END")
      else stub.fault = point

      const failure = await run(extractRun(b.retry()))
      expect(failure.type).toBe("stage-run-error")
      const record = b.record()
      expect(record.status).toBe("failed")
      const rows = { pages: count(b, "pages"), images: count(b, "images"), nodes: count(b, "node_data") }
      if (point === "after-record" || point === "transaction") {
        // Nothing was deleted: the transaction did not run, or rolled back as a whole.
        expect(rows).toEqual({ pages: before.pages, images: before.images, nodes: before.nodes })
        expect(record.attemptId).toBe(before.attemptId)
      } else if (point === "extracting") {
        expect(record.attemptId).not.toBe(before.attemptId)
        expect(rows.pages).toBe(1)
      } else {
        expect(rows).toEqual({ pages: 0, images: 0, nodes: 0 })
        expect(fs.readdirSync(path.join(b.dir, "images"))).toEqual(point === "leftover-file" ? ["leftover.png"] : [])
      }

      const again = await offered()
      expect(again).toEqual({ actions: ["retry"], attemptId: record.attemptId, contentToken: digest, blockedReason: null })
      stub.fault = null
      if (point === "transaction") b.exec("DROP TRIGGER fault_reset")
      expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
      expect(b.record()).toMatchObject({ status: "complete" })
      expect(b.record().attemptId).not.toBe(record.attemptId)
      expect(count(b, "pages")).toBe(2)
      expect(statuses(b)).toEqual(allDone)
    })

  it.each(["the PDF is missing", "the PDF bytes changed", "the project identity names another PDF", "the page window is invalid"])(
    "RAC-22: a missing or changed PDF is refused before the reset (%s)", async kind => {
      const b = book()
      const pdf = path.join(b.dir, `${label}.pdf`)
      if (kind === "the PDF is missing") fs.rmSync(pdf)
      if (kind === "the PDF bytes changed") fs.writeFileSync(pdf, Buffer.concat([fs.readFileSync(pdf), Buffer.from("\n% changed")]))
      if (kind === "the project identity names another PDF") {
        const file = path.join(b.dir, PROJECT_IDENTITY_FILE)
        fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), sourceFingerprint: "0".repeat(64) }))
      }
      if (kind === "the page window is invalid") fs.writeFileSync(path.join(b.dir, "config.yaml"), "start_page: 98\nend_page: 99\n")
      const before = snapshot(b)
      const code = kind === "the PDF is missing" || kind === "the page window is invalid" ? "EXTRACTION_INPUT_INVALID" : "EXTRACTION_SOURCE_CHANGED"

      await expect(createStageRunner().run(label, runOptions(b.root, b.retry()), { emit() {} })).rejects.toMatchObject({ code })
      expect(snapshot(b)).toEqual(before)
      // Through the route the run starts and fails with the same typed error, still without a write.
      const { offered, run } = server(b.root)
      expect(await run(extractRun(b.retry()))).toMatchObject({ type: "stage-run-error", code })
      expect(snapshot(b)).toEqual(before)
      expect(await offered()).toMatchObject({ actions: ["retry"] })
      expect(stub.calls).toEqual([])
    })

  it("RAC-22: retry is refused once anything but Extract output exists", async () => {
    const sectioned = book()
    sectioned.read(storage => storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [] }))
    const later = book()
    later.read(storage => storage.markStepCompleted("tts"))
    for (const b of [sectioned, later]) {
      const before = snapshot(b)
      const { post, offered, service } = server(b.root)
      expect(await offered()).toMatchObject({ actions: [], blockedReason: "downstream-output" })
      // Exactly what this book answers without the field.
      expect(await refusal(await post(extractRun(b.retry())))).toEqual({ status: 409, code: "EXTRACTION_INCOMPLETE", error: incomplete })
      expect(service.getStatus(label).active).toBeNull()
      await expect(createStageRunner().run(label, runOptions(b.root, b.retry()), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_INCOMPLETE" })
      expect(snapshot(b)).toEqual(before)
    }
    expect(stub.calls).toEqual([])
  })

  it("RAC-22: a stale retry is refused before any write", async () => {
    const b = book()
    const stale = async (binding: Partial<ExtractRerunRequest>) => {
      const before = snapshot(b)
      const request = { ...b.retry(), ...binding }
      const { post, service } = server(b.root)
      const body = await refusal(await post(extractRun(request)))
      expect(body).toMatchObject({ status: 409, code: "EXTRACTION_RERUN_STALE" })
      expect(body.error).not.toMatch(/fresh|pnpm pipeline/)
      expect(service.getStatus(label).active).toBeNull()
      expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"), request)()).toThrow("EXTRACTION_RERUN_STALE")
      await expect(createStageRunner().run(label, runOptions(b.root, request), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_RERUN_STALE" })
      expect(snapshot(b)).toEqual(before)
    }
    await stale({ attemptId: "00000000-0000-4000-8000-000000000000" })
    await stale({ attemptId: null })
    // The right extraction, described by content the book no longer holds.
    await stale({ contentToken: "0".repeat(64) })
    // An action the book does not offer is stale too: nothing can resume or replace a failed extraction.
    for (const action of ["resume", "replace"]) {
      const before = snapshot(b)
      expect(await refusal(await server(b.root).post(extractRun({ ...b.retry(), action })))).toMatchObject({ status: 409, code: action === "resume" ? "EXTRACTION_RERUN_STALE" : "EXTRACTION_INCOMPLETE" })
      expect(snapshot(b)).toEqual(before)
    }
    // Once the extraction is complete a retry no longer applies, whatever it is bound to.
    expect(await server(b.root).run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    stub.calls.length = 0
    await stale({})
    // The same on a complete extraction whose later Extract step failed (resume and replace are offered).
    b.read(storage => storage.recordStepError("book-summary", "provider failed"))
    expect(await server(b.root).offered()).toMatchObject({ actions: ["resume", "replace"] })
    await stale({})
    expect(stub.calls).toEqual([])
  })

  it("RAC-22: retry is never queued", async () => {
    const b = book()
    // The only run a book with a failed extraction admits is a retry: hold one
    // at the runner, before it changes anything, and ask again (a double click).
    let finish = () => {}
    let entered = () => {}
    const running = new Promise<void>(resolve => { entered = resolve })
    const blocked: StageRunner = { run: () => new Promise<void>(resolve => { finish = resolve; entered() }) }
    const { post, service, bus } = server(b.root, blocked)
    const settled = new Promise<void>(resolve => bus.addListener(label, event => { if (event.type === "stage-run-complete") resolve() }))
    const before = snapshot(b)
    expect((await post(extractRun(b.retry()))).status).toBe(200)
    await running
    for (const action of ["retry", "replace"]) {
      const body = await refusal(await post(extractRun({ ...b.retry(), action })))
      expect(body).toMatchObject({ status: 409, code: "EXTRACTION_RERUN_STALE" })
      expect(service.getStatus(label).queue).toEqual([])
    }
    expect(service.getStatus(label).active).toMatchObject({ fromStage: "extract", status: "running" })
    // While the run is being cancelled it still occupies the book.
    expect(service.cancelStageRun(label)).toEqual({ status: "cancelling" })
    expect(await refusal(await post(extractRun(b.retry())))).toMatchObject({ status: 409, code: "EXTRACTION_RERUN_STALE" })
    expect(service.getStatus(label).queue).toEqual([])
    expect(snapshot(b)).toEqual(before)
    finish()
    await settled
  })

  it("RAC-22: a request without the field is refused as today", async () => {
    const b = book()
    const before = snapshot(b)
    const { post } = server(b.root)
    for (const body of [extractRun(), { fromStage: "sectioning", toStage: "sectioning" }, { fromStage: "extract", toStage: "storyboard" }]) {
      expect(await refusal(await post(body)), JSON.stringify(body)).toEqual({ status: 409, code: "EXTRACTION_INCOMPLETE", error: incomplete })
    }
    expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"))()).toThrow(incomplete)
    await expect(createStageRunner().run(label, runOptions(b.root), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_INCOMPLETE" })
    expect(snapshot(b)).toEqual(before)
    expect(stub.calls).toEqual([])
  })

  it("RAC-22: an accepted book passes the post-reset check", async () => {
    const b = book()
    // Everything a retry keeps: fonts and their nodes, typography, style guides,
    // template and prompt overrides, the LLM log and cache, a Sectioning
    // preference saved before Sectioning ran, and a part window.
    b.read(storage => {
      storage.putNodeData(FONT_REGISTRY_NODE, "book", { fonts: [{ id: "custom", family: "Custom", source: "upload", faces: [{ weight: 400, style: "normal", file: "custom.woff2", format: "woff2" }] }] })
      storage.putNodeData("font-assignment", "book", { roles: {} })
      storage.putNodeData("typography", "book", { roles: {} })
      storage.putNodeData("legacy-output-baseline", "book", { version: 1 })
    })
    b.exec("INSERT INTO llm_log (timestamp, step, data) VALUES ('2026-01-01T00:00:00.000Z', 'metadata', '{}')")
    const files: Record<string, string> = {
      "fonts/custom.woff2": "font", "styleguides/book-generated.md": "# Guide", "templates/two_column.liquid": "<section></section>",
      "prompts/metadata.liquid": "prompt", ".cache/entry.json": "{}",
      "part.json": partManifest(mergeIdentity(b)),
    }
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(b.dir, file)), { recursive: true })
      fs.writeFileSync(path.join(b.dir, file), content)
    }
    writeSectioningLifecycle(b.dir, "page", false)
    const lifecycle = fs.readFileSync(path.join(b.dir, ".sectioning-lifecycle.json"), "utf8")
    const retained = () => b.rows("SELECT node, item_id, version, data FROM node_data WHERE node IN ('font-registry', 'font-assignment', 'typography', 'legacy-output-baseline') ORDER BY node")
    const nodes = retained()
    expect(nodes).toHaveLength(4)

    const { offered, run } = server(b.root)
    expect(await offered()).toMatchObject({ actions: ["retry"] })
    expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(count(b, "pages")).toBe(2)
    expect(statuses(b)).toEqual(allDone)
    expect(retained()).toEqual(nodes)
    expect(count(b, "llm_log")).toBe(1)
    for (const [file, content] of Object.entries(files)) expect(fs.readFileSync(path.join(b.dir, file), "utf8"), file).toBe(content)
    expect(fs.readFileSync(path.join(b.dir, ".sectioning-lifecycle.json"), "utf8")).toBe(lifecycle)
    // A part keeps its fixed window and is not offered a replace.
    expect(await offered()).toMatchObject({ actions: [], blockedReason: "part-book" })
  })

  it("RAC-22: retry works when the record is unreadable", async () => {
    const b = book()
    fs.writeFileSync(path.join(b.dir, "extraction.json"), "{")
    const { offered, run } = server(b.root)
    expect(await offered()).toEqual({ actions: ["retry"], attemptId: null, contentToken: digest, blockedReason: null })
    expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(b.read(storage => storage.getPages()).map(page => page.pageId)).toEqual(["pg001", "pg002"])
    expect(statuses(b)).toEqual(allDone)
  })

  it.each(["a book detail is edited", "an image decision is made", "an image is uploaded"])(
    "RAC-22: a retry made against other content is refused before any write (%s)", async kind => {
      const b = book()
      const request = b.retry()
      // Another window changes the book through its own storage handle.
      if (kind === "a book detail is edited") b.read(storage => storage.putNodeData("metadata", "book", { title: "Edited meanwhile" }))
      if (kind === "an image decision is made") b.read(storage => storage.putNodeData("image-filtering", "pg001", { images: [] }))
      if (kind === "an image is uploaded") {
        b.exec("INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES ('pg001_upload001', 'pg001', 'images/pg001_upload001.png', 'h', 4, 4, 'upload')")
        fs.writeFileSync(path.join(b.dir, "images", "pg001_upload001.png"), "png")
      }
      const before = snapshot(b)
      const { post, offered, run, service } = server(b.root)
      expect(await refusal(await post(extractRun(request)))).toMatchObject({ status: 409, code: "EXTRACTION_RERUN_STALE" })
      expect(service.getStatus(label).active).toBeNull()
      expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"), request)()).toThrow("EXTRACTION_RERUN_STALE")
      // The reset itself checks the binding again (step 1), whoever calls it.
      await expect(createStageRunner().run(label, runOptions(b.root, request), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_RERUN_STALE" })
      expect(snapshot(b)).toEqual(before)
      expect(stub.calls).toEqual([])
      // A request made against the book as it is now is accepted.
      const current = await offered()
      expect(current.contentToken).not.toBe(request.contentToken)
      expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    })

  it("RAC-22: a retry without a content token is not a valid request", async () => {
    const b = book()
    const before = snapshot(b)
    const { post, service } = server(b.root)
    for (const contentToken of [undefined, null, "", "not-a-digest"]) {
      const response = await post(extractRun({ action: "retry", attemptId: b.record().attemptId, contentToken }))
      expect(response.status, JSON.stringify(contentToken)).toBe(400)
    }
    expect(service.getStatus(label).active).toBeNull()
    expect(snapshot(b)).toEqual(before)
  })

  it.each([
    ["spread mode", "spread_mode: true\n"],
    ["figure extraction", "figure_extraction_mode: all\n"],
    ["watermark removal", "remove_watermarks: true\n"],
  ])("RAC-22: a part whose %s no longer matches its coordinator is refused before the reset", async (_setting, change) => {
    const b = book()
    fs.writeFileSync(path.join(b.dir, "part.json"), partManifest(mergeIdentity(b)))
    const settings = path.join(b.dir, "config.yaml")
    const original = fs.readFileSync(settings, "utf8")
    fs.writeFileSync(settings, `${original}${change}`)
    expect(mergeIdentity(b)).not.toBe(JSON.parse(fs.readFileSync(path.join(b.dir, "part.json"), "utf8")).identityHash)
    const before = snapshot(b)

    await expect(createStageRunner().run(label, runOptions(b.root, b.retry()), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_PART_SETTINGS_CHANGED" })
    expect(snapshot(b)).toEqual(before)
    const { offered, run } = server(b.root)
    expect(await run(extractRun(b.retry()))).toMatchObject({ type: "stage-run-error", code: "EXTRACTION_PART_SETTINGS_CHANGED" })
    expect(snapshot(b)).toEqual(before)
    expect(stub.calls).toEqual([])

    // Restoring the part's settings makes Retry available again.
    fs.writeFileSync(settings, original)
    expect(await offered()).toMatchObject({ actions: ["retry"] })
    expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(count(b, "pages")).toBe(2)
  })

  it("RAC-22: a part exported before a database schema update can still be retried", async () => {
    const b = book()
    // The recorded hash also covers the schema version, which an app update
    // changes for the part and its coordinator alike: the merge gate recomputes
    // both sides, so the part still merges while its PDF and settings are those recorded.
    const exported = underOlderSchema(mergeFingerprint(b))
    expect(exported.identityHash).not.toBe(mergeIdentity(b))
    fs.writeFileSync(path.join(b.dir, "part.json"), partManifest(exported.identityHash, exported))
    const settings = path.join(b.dir, "config.yaml")
    const original = fs.readFileSync(settings, "utf8")

    // A setting that changes the identity is still refused, before any write.
    fs.writeFileSync(settings, `${original}spread_mode: true\n`)
    const before = snapshot(b)
    await expect(createStageRunner().run(label, runOptions(b.root, b.retry()), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_PART_SETTINGS_CHANGED" })
    expect(snapshot(b)).toEqual(before)

    fs.writeFileSync(settings, original)
    const { run } = server(b.root)
    expect(await run(extractRun(b.retry()))).toEqual({ type: "stage-run-complete", label })
    expect(b.record()).toMatchObject({ status: "complete" })
    expect(count(b, "pages")).toBe(2)
  })

  it.each(["is not the one its hash names", "is missing", "is unreadable"])(
    "RAC-22: a part whose recorded identity %s is compared by its hash alone", async kind => {
      const b = book()
      const current = mergeFingerprint(b)
      // The recorded settings equal the current ones, but nothing ties them to the hash the part was exported with.
      const recorded = kind === "is missing" ? null : kind === "is unreadable" ? { identity: "corrupt" } : current
      fs.writeFileSync(path.join(b.dir, "part.json"), partManifest("a".repeat(64), recorded))
      const before = snapshot(b)
      await expect(createStageRunner().run(label, runOptions(b.root, b.retry()), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_PART_SETTINGS_CHANGED" })
      expect(snapshot(b)).toEqual(before)
      expect(stub.calls).toEqual([])
    })
})
