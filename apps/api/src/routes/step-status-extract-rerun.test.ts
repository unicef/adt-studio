import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const inspection = vi.hoisted(() => ({ fail: false }))
vi.mock("@adt/storage", async original => {
  const real = await original<typeof import("@adt/storage")>()
  return { ...real, createBookStorage: (...args: Parameters<typeof real.createBookStorage>) => {
    const storage = real.createBookStorage(...args)
    if (inspection.fail) storage.inspectExtractOnly = () => { throw new Error("inspection failed") }
    return storage
  } }
})
import { createBookStorage, openBookDb } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { extractPDF } from "@adt/pipeline"
import { ExtractRerunStatus, PIPELINE } from "@adt/types"
import { createStageRoutes } from "./stages.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import type { StageService } from "../services/stage-service.js"
import { ADT_IMPORT_CURRENT_FILE } from "../services/adt-import/source.js"

const repo = path.resolve(import.meta.dirname, "../../../..")
const extractSteps = PIPELINE.find(stage => stage.name === "extract")!.steps.map(step => step.name)
const dirs: string[] = []
let template: string

/** One real single-page extraction with every Extract step done, copied per case. */
beforeAll(async () => {
  template = fs.mkdtempSync(path.join(os.tmpdir(), "step-status-rerun-"))
  dirs.push(template)
  const storage = createBookStorage("book", template)
  try {
    await extractPDF({ pdfPath: path.join(repo, "tests/fixtures/raven.pdf"), startPage: 1, endPage: 1 }, storage, { emit() {} })
    for (const step of extractSteps) storage.markStepCompleted(step)
  } finally { storage.close() }
}, 60_000)
afterEach(() => { inspection.fail = false; vi.restoreAllMocks() })
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) })

interface Fixture { root: string; bookDir: string; edit(use: (storage: Storage) => void): void }
function fixture(extracted = true): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "step-status-rerun-"))
  dirs.push(root)
  fs.writeFileSync(path.join(root, "config.yaml"), "structure_types: {}\nrole_types: {}\n")
  const bookDir = path.join(root, "book")
  if (extracted) fs.cpSync(path.join(template, "book"), bookDir, { recursive: true })
  const edit: Fixture["edit"] = use => {
    const storage = createBookStorage("book", root)
    try { use(storage) } finally { storage.close() }
  }
  return { root, bookDir, edit }
}
const attemptOf = (bookDir: string): string => JSON.parse(fs.readFileSync(path.join(bookDir, "extraction.json"), "utf8")).attemptId

const digest = expect.stringMatching(/^[a-f0-9]{64}$/)

async function extractRerun(root: string, run: { active?: { status: string }; queued?: string[] } = {}): Promise<ExtractRerunStatus> {
  const bus = createBookEventBus()
  const service = {
    getStatus: () => ({ active: run.active ? { label: "book", fromStage: "extract", toStage: "extract", ...run.active } : null, queue: [] }),
    getQueuedStages: () => run.queued ?? [],
  } as unknown as StageService
  const app = new Hono().onError(errorHandler)
    .route("/", createStageRoutes(service, bus, createPageErrorDecisions(bus), root, root, root, path.join(root, "config.yaml")))
  const response = await app.request("/books/book/step-status")
  expect(response.status).toBe(200)
  const body = await response.json() as { extractRerun: unknown; steps: Record<string, string> }
  expect(body.steps).toBeDefined()
  return ExtractRerunStatus.parse(body.extractRerun)
}

describe("RAC-24: step-status reports actions and reason", { timeout: 30_000 }, () => {
  it("a book without a database", async () => {
    const f = fixture(false)
    expect(await extractRerun(f.root)).toEqual({ actions: [], attemptId: null, contentToken: null, blockedReason: null })
    expect(fs.existsSync(f.bookDir)).toBe(false)
  })

  it("a fresh book before its first extraction", async () => {
    const f = fixture(false)
    f.edit(() => undefined)
    fs.copyFileSync(path.join(template, "book", "book.pdf"), path.join(f.bookDir, "book.pdf"))
    expect(await extractRerun(f.root)).toEqual({ actions: [], attemptId: null, contentToken: null, blockedReason: null })
  })

  it("a healthy extracted book with every Extract step done", async () => {
    const f = fixture()
    expect(await extractRerun(f.root)).toEqual({ actions: ["replace"], attemptId: attemptOf(f.bookDir), contentToken: digest, blockedReason: null })
  })

  it("an Extract step in error", async () => {
    const f = fixture()
    f.edit(storage => storage.recordStepError("book-summary", "provider failed"))
    expect(await extractRerun(f.root)).toEqual({ actions: ["resume", "replace"], attemptId: attemptOf(f.bookDir), contentToken: digest, blockedReason: null })
  })

  it("a failed extraction record", async () => {
    const f = fixture()
    const record = path.join(f.bookDir, "extraction.json")
    fs.writeFileSync(record, JSON.stringify({ ...JSON.parse(fs.readFileSync(record, "utf8")), status: "failed" }))
    expect(await extractRerun(f.root)).toEqual({ actions: ["retry"], attemptId: attemptOf(f.bookDir), contentToken: digest, blockedReason: null })
    fs.writeFileSync(record, "{")
    expect(await extractRerun(f.root)).toEqual({ actions: ["retry"], attemptId: null, contentToken: digest, blockedReason: null })
  })

  it("a book with a page-sectioning node", async () => {
    const f = fixture()
    f.edit(storage => storage.putNodeData("page-sectioning", "pg001", { sections: [] }))
    expect(await extractRerun(f.root)).toEqual({ actions: [], attemptId: attemptOf(f.bookDir), contentToken: null, blockedReason: "downstream-output" })
  })

  it("an imported ADT project", async () => {
    const f = fixture()
    fs.writeFileSync(path.join(f.bookDir, ADT_IMPORT_CURRENT_FILE), "{}")
    expect(await extractRerun(f.root)).toMatchObject({ actions: [], blockedReason: "not-pdf-source" })
  })

  it("a part book", async () => {
    const f = fixture()
    fs.writeFileSync(path.join(f.bookDir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null,
      range: { startPage: 1, endPage: 1 }, pageCount: 1, fingerprint: null, identityHash: "a", semanticsHash: "b",
      createdAt: "2026-01-01T00:00:00.000Z", partLabelSuggestion: "source-part-1" }))
    expect(await extractRerun(f.root)).toEqual({ actions: [], attemptId: attemptOf(f.bookDir), contentToken: null, blockedReason: "part-book" })
    f.edit(storage => storage.clearStepRuns(["image-cropping"]))
    expect(await extractRerun(f.root)).toEqual({ actions: ["resume"], attemptId: attemptOf(f.bookDir), contentToken: null, blockedReason: null })
  })

  it.each([{ active: { status: "running" } }, { active: { status: "cancelling" } }, { queued: ["extract"] }])("an active or queued run: %j", async run => {
    const f = fixture()
    expect(await extractRerun(f.root, run)).toEqual({ actions: [], attemptId: attemptOf(f.bookDir), contentToken: null, blockedReason: "run-active" })
  })

  it("a settled failed run does not count as active", async () => {
    const f = fixture()
    expect(await extractRerun(f.root, { active: { status: "failed" } })).toMatchObject({ actions: ["replace"], blockedReason: null })
  })

  it("a failing inspection leaves the rest of step-status usable", async () => {
    const f = fixture()
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    inspection.fail = true
    expect(await extractRerun(f.root)).toEqual({ actions: [], attemptId: null, contentToken: null, blockedReason: "unrecognized-content" })
    expect(logged).toHaveBeenCalledTimes(1)
  })

  it("the content token follows the content a retry or replace discards", async () => {
    const f = fixture()
    const token = async () => (await extractRerun(f.root)).contentToken
    const first = await token()
    expect(first).toEqual(digest)
    expect(await token()).toBe(first)

    // Kept by a reset, or bookkeeping of the run itself: not part of the token.
    f.edit(storage => {
      storage.putNodeData("typography", "book", { edited: true })
      storage.appendLlmLog({ requestId: "r1", timestamp: "2026-01-01T00:00:00.000Z", taskType: "metadata", pageId: "pg001", success: true, errorCount: 0 } as Parameters<Storage["appendLlmLog"]>[0])
    })
    expect(await token()).toBe(first)

    // A new version of an Extract node (a metadata edit, an image decision).
    f.edit(storage => storage.putNodeData("metadata", "book", { title: "Edited" }))
    const afterEdit = await token()
    expect(afterEdit).toEqual(digest)
    expect(afterEdit).not.toBe(first)

    // An image row, as an upload adds one.
    const db = openBookDb(path.join(f.bookDir, "book.db"))
    try { db.run("INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES ('pg001_upload001', 'pg001', 'images/pg001_upload001.png', 'h', 4, 4, 'upload')") }
    finally { db.close() }
    fs.writeFileSync(path.join(f.bookDir, "images", "pg001_upload001.png"), "png")
    const afterUpload = await token()
    expect(afterUpload).toEqual(digest)
    expect(afterUpload).not.toBe(afterEdit)

    // The extraction record.
    const record = path.join(f.bookDir, "extraction.json")
    fs.writeFileSync(record, JSON.stringify({ ...JSON.parse(fs.readFileSync(record, "utf8")), status: "failed" }))
    const afterRecord = await extractRerun(f.root)
    expect(afterRecord).toMatchObject({ actions: ["retry"], contentToken: digest })
    expect(afterRecord.contentToken).not.toBe(afterUpload)
  })

  it("binds a book that has no extraction record", async () => {
    const f = fixture()
    fs.rmSync(path.join(f.bookDir, "extraction.json"))
    const before = await extractRerun(f.root)
    expect(before).toEqual({ actions: ["replace"], attemptId: null, contentToken: digest, blockedReason: null })
    f.edit(storage => storage.putNodeData("metadata", "book", { title: "Edited" }))
    const after = await extractRerun(f.root)
    expect(after).toMatchObject({ actions: ["replace"], attemptId: null, contentToken: digest })
    expect(after.contentToken).not.toBe(before.contentToken)
  })
})
