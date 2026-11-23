import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

interface StubImage { imageId: string; width: number; height: number }
interface StubRequest { log?: { taskType?: string; pageId?: string }; context?: { images?: StubImage[] } }
const llm = vi.hoisted(() => ({
  calls: [] as Array<{ task: string; pageId?: string; imageIds: string[] }>,
  /** Task types whose provider call fails. */
  fail: new Set<string>(),
  /** Image ids the meaningfulness stub rejects. */
  reject: new Set<string>(),
  /** Image ids to segment in two halves / crop to the left half; "*" means every image sent. */
  segment: new Set<string>(),
  crop: new Set<string>(),
  extractPDF: vi.fn(),
}))
const chosen = (set: Set<string>, id: string) => set.has("*") || set.has(id)
vi.mock("@adt/llm", async original => ({
  ...await original<typeof import("@adt/llm")>(),
  createLLMModel: () => ({
    async generateObject(request: StubRequest) {
      const task = request.log?.taskType ?? "unknown"
      const images = request.context?.images ?? []
      llm.calls.push({ task, pageId: request.log?.pageId, imageIds: images.map(image => image.imageId) })
      if (llm.fail.has(task)) throw new Error(`${task} provider failed`)
      const each = <T>(result: (image: StubImage) => T) => ({ object: { images: images.map(image => ({ image_id: image.imageId, reasoning: "stub", ...result(image) })) } })
      if (task === "metadata") return { object: { title: "Raven", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "stub" } }
      if (task === "book-summary") return { object: { summary: "A stub summary." } }
      if (task === "image-meaningfulness") return each(image => ({ is_meaningful: !llm.reject.has(image.imageId) }))
      if (task === "image-segmentation") return each(image => chosen(llm.segment, image.imageId)
        ? { needs_segmentation: true, segments: ["a", "b"].map((label, half) => ({ label, crop_left: half * Math.floor(image.width / 2), crop_top: 0, crop_right: half ? image.width : Math.floor(image.width / 2), crop_bottom: image.height })) }
        : { needs_segmentation: false, segments: [] })
      if (task === "image-cropping") return each(image => ({ should_crop: chosen(llm.crop, image.imageId), crop_left: 0, crop_top: 0, crop_right: Math.ceil(image.width / 2), crop_bottom: image.height }))
      throw new Error(`Unexpected provider call: ${task}`)
    },
  }),
}))
vi.mock("@adt/pipeline", async original => {
  const real = await original<typeof import("@adt/pipeline")>()
  llm.extractPDF.mockImplementation(real.extractPDF)
  return {
    ...real,
    extractPDF: llm.extractPDF,
    generateBookOutline: async () => { llm.calls.push({ task: "book-outline", imageIds: [] }); return { entries: [] } },
  }
})

import { createBookStorage, openBookDb } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { PIPELINE, type ExtractRerunRequest, type ProgressEvent } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"
import { createStageService } from "./stage-service.js"
import { createBookEventBus, type BookSSEEvent } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import { createBook } from "./book-service.js"
import { createStageRoutes, makeBeforeRun } from "../routes/stages.js"
import { createPageRoutes } from "../routes/pages.js"
import { errorHandler } from "../middleware/error-handler.js"

const repo = path.resolve(import.meta.dirname, "../../../..")
const label = "book"
const extractSteps = PIPELINE.find(stage => stage.name === "extract")!.steps.map(step => step.name)
const imageSteps = ["image-filtering", "image-meaningfulness", "image-segmentation", "image-cropping"]
const config = 'structure_types: {}\nrole_types: {}\ndefault_model: "ollama:llama3"\nconcurrency: 1\nimage_filters:\n  segmentation: true\n  cropping: true\n'
const dirs: string[] = []
let template: string

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "extract-resume-"))
  dirs.push(root)
  fs.writeFileSync(path.join(root, "config.yaml"), config)
  return root
}
const runOptions = (root: string, extraction?: ExtractRerunRequest) => ({
  booksDir: root, promptsDir: root, configPath: path.join(root, "config.yaml"), credentials: {}, fromStage: "extract", toStage: "extract", extraction,
})

/** A real two-page first Extract run whose book-summary call fails (case B):
 * extract and metadata are done, book-summary is in error, nothing later ran. */
beforeAll(async () => {
  template = tempRoot()
  createBook(label, fs.readFileSync(path.join(repo, "tests/fixtures/raven.pdf")), template, { start_page: 1, end_page: 2 })
  llm.fail.add("book-summary")
  await expect(createStageRunner().run(label, runOptions(template), { emit() {} })).rejects.toThrow("book-summary provider failed")
}, 120_000)
beforeEach(() => {
  llm.calls.length = 0
  for (const set of [llm.fail, llm.reject, llm.segment, llm.crop]) set.clear()
  llm.extractPDF.mockClear()
})
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) })

interface Book {
  root: string
  dir: string
  attemptId: string | null
  read<T>(use: (storage: Storage) => T): T
  rows(sql: string): unknown[]
  resume(attemptId?: string | null): Promise<ProgressEvent[]>
}
function book(): Book {
  const root = tempRoot()
  const dir = path.join(root, label)
  fs.cpSync(path.join(template, label), dir, { recursive: true })
  const read: Book["read"] = use => { const storage = createBookStorage(label, root); try { return use(storage) } finally { storage.close() } }
  const self: Book = {
    root, dir, read,
    get attemptId() {
      const record = path.join(dir, "extraction.json")
      return fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, "utf8")).attemptId as string : null
    },
    rows(sql) { const db = openBookDb(path.join(dir, `${label}.db`)); try { return db.all(sql) } finally { db.close() } },
    async resume(attemptId = self.attemptId) {
      const events: ProgressEvent[] = []
      await createStageRunner().run(label, runOptions(root, { action: "resume", attemptId }), { emit: event => { events.push(event) } })
      return events
    },
  }
  return self
}
const statuses = (b: Book) => Object.fromEntries(b.read(storage => storage.getStepRuns()).map(run => [run.step, run.status]))
const tasks = () => llm.calls.map(call => call.task)
const callsOf = (task: string) => llm.calls.filter(call => call.task === task)
const stepEvents = (events: ProgressEvent[], type: string) => events.filter(event => event.type === type).map(event => (event as { step: string }).step)
const versions = (b: Book, node: string) => b.read(storage => storage.getPages().map(page => storage.getAllNodeVersions(node, page.pageId).map(row => row.version)))
const imageList = (b: Book, pageId: string) => b.read(storage => storage.getLatestNodeData("image-filtering", pageId)!.data as { images: Array<{ imageId: string; isPruned: boolean; reason?: string }> })
const extracted = "SELECT image_id, page_id, path, hash, width, height, source FROM images WHERE source = 'extract' ORDER BY image_id"
const listing = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).map(entry => path.join(entry.parentPath, entry.name)).sort()
const snapshot = (b: Book) => ({
  db: createHash("sha256").update(fs.readFileSync(path.join(b.dir, `${label}.db`))).digest("hex"),
  files: listing(b.dir),
})
/** Give every page the list the filter pass writes, and mark steps done as a completed run would. */
function seedImageLists(b: Book, done: string[]): void {
  b.read(storage => {
    for (const page of storage.getPages()) {
      storage.putNodeData("image-filtering", page.pageId, { images: storage.getPageImages(page.pageId).map(image =>
        image.imageId === `${page.pageId}_page` ? { imageId: image.imageId, isPruned: true, reason: "full-page render" } : { imageId: image.imageId, isPruned: false }) })
    }
    for (const step of done) storage.markStepCompleted(step)
  })
}
function server(root: string) {
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService(createStageRunner(), bus, decisions)
  const configPath = path.join(root, "config.yaml")
  const app = new Hono().onError(errorHandler)
    .route("/", createStageRoutes(service, bus, decisions, root, root, root, configPath))
    .route("/", createPageRoutes(root, root, undefined, configPath))
  const post = (body: unknown) => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  return { app, bus, service, post }
}
const extractRun = (extraction?: unknown) => ({ fromStage: "extract", toStage: "extract", ...(extraction ? { extraction } : {}) })

describe("SPEC-0003 Extract resume", { timeout: 60_000 }, () => {
  it("RAC-21: resume runs only pending steps and never reads the PDF", async () => {
    const b = book()
    expect(statuses(b)).toEqual({ extract: "done", metadata: "done", "book-summary": "error" })
    const metadata = () => b.read(storage => storage.getAllNodeVersions("metadata", "book"))
    const before = { record: fs.readFileSync(path.join(b.dir, "extraction.json")), pages: b.read(storage => storage.getPages()), images: b.rows(extracted), metadata: metadata() }
    fs.rmSync(path.join(b.dir, `${label}.pdf`))
    const { app, bus, post } = server(b.root)
    const offered = (await (await app.request(`/books/${label}/step-status`)).json() as { extractRerun: { actions: string[]; attemptId: string } }).extractRerun
    expect(offered).toMatchObject({ actions: ["resume", "replace"], attemptId: b.attemptId })

    const events: BookSSEEvent[] = []
    const settled = new Promise<BookSSEEvent>(resolve => bus.addListener(label, event => {
      events.push(event)
      if (event.type === "stage-run-complete" || event.type === "stage-run-error") resolve(event)
    }))
    const response = await post(extractRun({ action: "resume", attemptId: offered.attemptId }))
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await settled).toEqual({ type: "stage-run-complete", label })

    expect(llm.extractPDF).not.toHaveBeenCalled()
    expect(tasks()).not.toContain("metadata")
    expect(tasks().slice(0, 2)).toEqual(["book-summary", "book-outline"])
    for (const task of ["image-meaningfulness", "image-segmentation", "image-cropping"]) expect(callsOf(task).length, task).toBeGreaterThan(0)
    const progress = events.flatMap(event => event.type === "progress" ? [event.data] : [])
    expect(stepEvents(progress, "step-start")).toEqual(["book-summary", "book-outline", ...imageSteps])
    expect(statuses(b)).toEqual(Object.fromEntries(extractSteps.map(step => [step, "done"])))
    expect(fs.readFileSync(path.join(b.dir, "extraction.json")).equals(before.record)).toBe(true)
    expect(b.read(storage => storage.getPages())).toEqual(before.pages)
    expect(b.rows(extracted)).toEqual(before.images)
    expect(metadata()).toEqual(before.metadata)
    expect(b.read(storage => storage.getLatestNodeData("book-summary", "book")?.data)).toEqual({ summary: "A stub summary." })
  })

  it("RAC-21: resume keeps existing image lists", async () => {
    const b = book()
    seedImageLists(b, ["image-filtering", "image-meaningfulness"])
    // A manual prune through the real route, after the lists were built.
    const edited = imageList(b, "pg001")
    edited.images.find(image => image.imageId === "pg001_im002")!.isPruned = true
    const { app } = server(b.root)
    expect((await app.request(`/books/${label}/pages/pg001/image-filtering`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(edited) })).status).toBe(200)
    const before = versions(b, "image-filtering")
    expect(before).toEqual([[1, 2], [1]])

    const events = await b.resume()
    // The stubs segment and crop nothing, so no pass has a reason to write a
    // list: no page gets a new image-filtering version, and the filter and
    // meaningfulness steps (already done) neither run nor emit.
    expect(versions(b, "image-filtering")).toEqual(before)
    expect(imageList(b, "pg001")).toEqual(edited)
    expect(stepEvents(events, "step-start")).toEqual(["book-summary", "book-outline", "image-segmentation", "image-cropping"])
    expect(tasks()).not.toContain("image-meaningfulness")
    // The later passes read the current list: the manually pruned image is not sent.
    for (const task of ["image-segmentation", "image-cropping"]) {
      expect(callsOf(task).map(call => call.pageId)).toEqual(["pg001", "pg002"])
      expect(callsOf(task)[0].imageIds).not.toContain("pg001_im002")
      expect(callsOf(task)[0].imageIds).toContain("pg001_im001")
    }
  })

  it("RAC-21: a resumed meaningfulness pass re-judges kept images only, so a manual prune survives and a manual keep can be overturned", async () => {
    const b = book()
    seedImageLists(b, ["image-filtering"])
    b.read(storage => {
      const list = storage.getLatestNodeData("image-filtering", "pg001")!.data as ReturnType<typeof imageList>
      list.images.find(image => image.imageId === "pg001_im002")!.isPruned = true
      storage.putNodeData("image-filtering", "pg001", list)
    })
    llm.reject.add("pg001_im003")
    const events = await b.resume()
    expect(stepEvents(events, "step-start")).not.toContain("image-filtering")
    expect(callsOf("image-meaningfulness").flatMap(call => call.imageIds)).not.toContain("pg001_im002")
    const list = imageList(b, "pg001").images
    expect(list.find(image => image.imageId === "pg001_im002")).toMatchObject({ isPruned: true })
    expect(list.find(image => image.imageId === "pg001_im003")).toMatchObject({ isPruned: true })
    // The earlier list stays restorable.
    expect(versions(b, "image-filtering")[0]).toEqual([1, 2, 3])
  })

  it("RAC-21: resume leaves segmented and cropped pages alone", async () => {
    const b = book()
    seedImageLists(b, ["image-filtering", "image-meaningfulness"])
    llm.segment.add("pg001_im001")
    llm.crop.add("pg001_im002")
    await b.resume()
    expect(statuses(b)).toEqual(Object.fromEntries(extractSteps.map(step => [step, "done"])))
    // A run killed after pg001: pg002 has neither pass's record, and neither step finished.
    const db = openBookDb(path.join(b.dir, `${label}.db`))
    try {
      for (const table of ["node_data", "node_current"]) db.run(`DELETE FROM ${table} WHERE node IN ('image-segmentation', 'image-cropping') AND item_id = 'pg002'`)
      db.run("DELETE FROM step_runs WHERE step IN ('image-segmentation', 'image-cropping')")
    } finally { db.close() }
    const derived = "SELECT image_id, hash FROM images WHERE page_id = 'pg001' AND source IN ('segment', 'crop') ORDER BY image_id"
    const before = { derived: b.rows(derived), list: imageList(b, "pg001"), lists: versions(b, "image-filtering")[0] }
    expect(before.derived.map(row => (row as { image_id: string }).image_id)).toEqual(["pg001_im001_seg001_v1", "pg001_im001_seg002_v1", "pg001_im002_crop_v1"])

    llm.calls.length = 0
    llm.segment.add("*")
    llm.crop.add("*")
    const events = await b.resume()
    expect(stepEvents(events, "step-start")).toEqual(["image-segmentation", "image-cropping"])
    expect(callsOf("image-segmentation").map(call => call.pageId)).toEqual(["pg002"])
    expect(callsOf("image-cropping").map(call => call.pageId)).toEqual(["pg002"])
    expect(b.rows(derived)).toEqual(before.derived)
    expect(imageList(b, "pg001")).toEqual(before.list)
    expect(versions(b, "image-filtering")[0]).toEqual(before.lists)
    for (const node of ["image-segmentation", "image-cropping"]) expect(versions(b, node)).toEqual([[1], [1]])
    const ids = (b.rows("SELECT image_id FROM images ORDER BY image_id") as Array<{ image_id: string }>).map(row => row.image_id)
    expect(ids.filter(id => /_seg\d+_v\d+_seg|_crop_v\d+_crop|_crop_v\d+_seg/.test(id))).toEqual([])
    expect(ids.filter(id => id.startsWith("pg002") && id.includes("_seg")).length).toBeGreaterThan(0)
    // Every marker written by the resumed passes has its images and its list entries.
    const listed = new Set(imageList(b, "pg002").images.map(image => image.imageId))
    expect(ids.filter(id => id.startsWith("pg002") && /_seg|_crop/.test(id)).every(id => listed.has(id))).toBe(true)
  })

  it("RAC-21: a page whose segments cannot all be stored keeps no segmentation record", async () => {
    const b = book()
    seedImageLists(b, ["image-filtering", "image-meaningfulness"])
    llm.segment.add("*")
    const write = fs.writeFileSync
    let stored = 0
    const failing = vi.spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      if (/pg002_im\d+_seg\d+_v\d+\.png$/.test(String(args[0])) && ++stored > 1) throw new Error("disk full")
      return write(...args)
    })
    try { await b.resume() } finally { failing.mockRestore() }
    expect(stored).toBe(2)
    // pg001 committed as a whole; pg002 rolled back as a whole, so a later resume can redo it.
    expect(versions(b, "image-segmentation")).toEqual([[1], []])
    expect(versions(b, "image-filtering")).toEqual([[1, 2], [1]])
    expect(b.rows("SELECT image_id FROM images WHERE page_id = 'pg002' AND source = 'segment'")).toEqual([])
    expect(b.rows("SELECT image_id FROM images WHERE page_id = 'pg001' AND source = 'segment'").length).toBeGreaterThan(0)
  })

  it.each(["an older book without an extraction record", "after spreads were re-applied"])("RAC-21: resume works on %s", async kind => {
    const b = book()
    const record = path.join(b.dir, "extraction.json")
    if (kind.startsWith("an older")) {
      fs.rmSync(record)
      b.read(storage => storage.clearStepRuns(["extract"]))
    } else {
      // What POST spreads/apply leaves behind: the pages differ from the record's inventory.
      b.read(storage => storage.deletePage("pg002"))
      expect(JSON.parse(fs.readFileSync(record, "utf8")).pages).toHaveLength(2)
    }
    const before = fs.existsSync(record) ? fs.readFileSync(record) : null
    const events = await b.resume()
    expect(llm.extractPDF).not.toHaveBeenCalled()
    expect(statuses(b)).toEqual(Object.fromEntries(extractSteps.map(step => [step, "done"])))
    expect(stepEvents(events, "step-complete").includes("extract")).toBe(before === null)
    expect(fs.existsSync(record) ? fs.readFileSync(record) : null).toEqual(before)
    expect(b.read(storage => storage.getPages()).length).toBe(before ? 1 : 2)
  })

  it("RAC-21: a stale request is refused before any write", async () => {
    const stale = book()
    const done = book()
    done.read(storage => { for (const step of extractSteps) storage.markStepCompleted(step) })
    for (const [b, attemptId] of [[stale, "00000000-0000-4000-8000-000000000000"], [stale, null], [done, done.attemptId]] as const) {
      const before = snapshot(b)
      const { post, service } = server(b.root)
      const response = await post(extractRun({ action: "resume", attemptId }))
      expect(response.status).toBe(409)
      const body = await response.json() as { code: string; error: string }
      expect(body.code).toBe("EXTRACTION_RERUN_STALE")
      // The remedy is a reload, not a new book: no fresh-label hint.
      expect(body.error).toMatch(/^EXTRACTION_RERUN_STALE: /)
      expect(body.error).not.toMatch(/fresh|pnpm pipeline/)
      expect(service.getStatus(label).active).toBeNull()
      expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"), { action: "resume", attemptId })()).toThrow("EXTRACTION_RERUN_STALE")
      await expect(createStageRunner().run(label, runOptions(b.root, { action: "resume", attemptId }), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_RERUN_STALE" })
      expect(snapshot(b)).toEqual(before)
    }
    expect(llm.calls).toEqual([])
  })

  it("RAC-21: a request without the field is refused as today", async () => {
    const b = book()
    const before = snapshot(b)
    const { post } = server(b.root)
    // Retry and replace are RAC-22/23: not accepted yet, so they change nothing either.
    for (const extraction of [undefined, { action: "retry", attemptId: b.attemptId }, { action: "replace", attemptId: b.attemptId }]) {
      const response = await post(extractRun(extraction))
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        code: "SECTIONING_REGENERATION_BLOCKED",
        error: "SECTIONING_REGENERATION_BLOCKED: Re-extraction of an existing book requires preservation-safe CLI/Extract admission. Existing pages and assets are kept.",
      })
    }
    expect(() => makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"))()).toThrow("SECTIONING_REGENERATION_BLOCKED")
    expect(snapshot(b)).toEqual(before)
    expect(llm.calls).toEqual([])
  })

  it("RAC-21: resume is refused once Sectioning or later output exists", async () => {
    const sectioned = book()
    sectioned.read(storage => storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [] }))
    const later = book()
    later.read(storage => storage.markStepCompleted("tts"))
    for (const [b, message] of [[sectioned, /Full extraction reruns cannot safely reconcile existing Sectioning/], [later, /Re-extraction of an existing book/]] as const) {
      const before = snapshot(b)
      const response = await server(b.root).post(extractRun({ action: "resume", attemptId: b.attemptId }))
      expect(response.status).toBe(409)
      const body = await response.json() as { code: string; error: string }
      expect(body.code).toBe("SECTIONING_REGENERATION_BLOCKED")
      expect(body.error).toMatch(message)
      expect(snapshot(b)).toEqual(before)
    }
    expect(llm.calls).toEqual([])
  })

  it("RAC-21: resume clears nothing", () => {
    const b = book()
    seedImageLists(b, ["image-filtering"])
    const state = () => ({
      ...snapshot(b),
      runs: b.read(storage => storage.getStepRuns()),
      nodes: b.read(storage => storage.getNodeVersionFingerprint()),
      pages: b.read(storage => storage.getPages()),
      images: b.rows("SELECT * FROM images ORDER BY image_id"),
    })
    const before = state()
    const prepare = makeBeforeRun(label, "extract", "extract", b.root, undefined, path.join(b.root, "config.yaml"), { action: "resume", attemptId: b.attemptId })
    prepare()
    prepare()
    expect(state()).toEqual(before)
    expect(before.runs.map(run => [run.step, run.status])).toEqual(expect.arrayContaining([["metadata", "done"], ["book-summary", "error"], ["image-filtering", "done"]]))
  })

  it("RAC-21: the extraction field is accepted only on a run from Extract to Extract", async () => {
    const b = book()
    const before = snapshot(b)
    const { post } = server(b.root)
    const extraction = { action: "resume", attemptId: b.attemptId }
    for (const body of [
      { fromStage: "extract", toStage: "sectioning", extraction },
      { fromStage: "sectioning", toStage: "sectioning", extraction },
      extractRun({ action: "repair", attemptId: b.attemptId }),
      extractRun({ action: "resume", attemptId: "not-a-uuid" }),
      extractRun({ action: "resume" }),
    ]) expect((await post(body)).status, JSON.stringify(body)).toBe(400)
    expect(snapshot(b)).toEqual(before)
  })
})
