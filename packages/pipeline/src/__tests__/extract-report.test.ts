import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import type { LlmLogEntry } from "@adt/llm"
import { SCHEMA_VERSION } from "@adt/types"
import { diffExtractReports, extractReportCsv, formatExtractReport, formatExtractReportDiff, hasExtractFindings, reportExtract, reportExtracts } from "../extract-report.js"

let root: string
const image = (imageId: string, pageId: string, hash: string, renderMethod: "vector" | "raster" = "vector") =>
  ({ imageId, pageId, buffer: Buffer.from(hash), format: "png" as const, hash, width: 200, height: 200, renderMethod })
const page = (pageId: string, pageNumber: number, text: string, images: ReturnType<typeof image>[] = []) =>
  ({ pageId, pageNumber, text, pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png" as const, hash: `page-${pageId}`, width: 100, height: 100 }, images })
const text = (role: string, body: string) => ({ role, content: [{ type: "text" as const, text: body }] })
const imagePart = (hash: string) => ({ type: "image" as const, hash, byteLength: 10, width: 200, height: 200 })
function meaningfulness(pageId: string, timestamp: string, system: string, hashes: string[], verdicts: Array<[string, boolean]>, extra: Partial<LlmLogEntry> = {}): LlmLogEntry {
  return {
    requestId: `${pageId}-${timestamp}`, timestamp, taskType: "image-meaningfulness", pageId, promptName: "image_meaningfulness", modelId: "openai:gpt-5.4",
    cacheHit: false, success: true, errorCount: 0, attempt: 0, durationMs: 1500, usage: { inputTokens: 1000, outputTokens: 50 },
    messages: [text("system", system), { role: "user", content: [imagePart(`page-${pageId}`), ...hashes.map(imagePart)] },
      text("assistant", JSON.stringify({ images: verdicts.map(([image_id, is_meaningful]) => ({ image_id, reasoning: "fixture", is_meaningful })) }))],
    ...extra,
  }
}
function seed(label: string, build: (db: Storage) => void) {
  const db = createBookStorage(label, root)
  try { build(db) } finally { db.close() }
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-extract-report-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it("reports a text-rich book with no images or model calls as having no findings", () => {
  seed("clean", (db) => {
    db.putExtractedPage(page("pg001", 1, "A page with a real text layer behind it."))
    db.markStepCompleted("extract", "page 1/1")
  })
  const report = reportExtract(root, "clean")
  expect(report).toMatchObject({ schemaVersion: SCHEMA_VERSION, schemaStatus: "current", pages: { count: 1, withoutText: 0, textProfile: "text-rich" }, images: { extracted: 0, duplicates: 0 }, tasks: [], findings: [] })
  expect(report.settings?.defaultModel).toMatch(/^[a-z]+:/)
  expect(hasExtractFindings(report)).toBe(false)
  expect(formatExtractReport(report)).toContain(`clean: schema ${SCHEMA_VERSION} · 1 pages · text-rich · no findings`)
  expect(formatExtractReport(report)).toContain("step extract: done — page 1/1")
})

it("measures the text layer, duplicate images, pruning, verdicts and attributes cache misses across two runs", () => {
  seed("scanned", (db) => {
    db.putExtractedPage(page("pg001", 1, "", [image("pg001_im001", "pg001", "logo"), image("pg001_im002", "pg001", "figure-a", "raster")]))
    db.putExtractedPage(page("pg002", 2, "   ", [image("pg002_im001", "pg002", "logo"), image("pg002_im002", "pg002", "tiny")]))
    db.putNodeData("image-filtering", "pg001", { images: [{ imageId: "pg001_page", isPruned: true, reason: "full-page render" }, { imageId: "pg001_im001", isPruned: true, reason: "not meaningful: a logo" }, { imageId: "pg001_im002", isPruned: false }] })
    db.putNodeData("image-filtering", "pg002", { images: [{ imageId: "pg002_page", isPruned: true, reason: "full-page render" }, { imageId: "pg002_im001", isPruned: true, reason: "not meaningful: a logo" }, { imageId: "pg002_im002", isPruned: true, reason: "shortest side 20px < min_side 100px" }] })
    db.putNodeData("extraction-debug", "pg001", { pageId: "pg001", groupsBeforeMerge: 5, groupsAfterMerge: 2, textOnlyGroupsSkipped: 1, groups: [] })
    db.putExtractedPage(page("pg003", 3, ""))
    db.putNodeData("image-filtering", "pg003", "{\"images\": [truncated")
    // First run: both pages classified. Second run: pg001 hit the cache, pg002 missed because the prompt changed.
    db.appendLlmLog(meaningfulness("pg001", "2026-05-01T10:00:00.000Z", "old prompt", ["logo", "figure-a"], [["pg001_im001", false], ["pg001_im002", true]]))
    db.appendLlmLog(meaningfulness("pg002", "2026-05-01T10:00:01.000Z", "old prompt", ["logo"], [["pg002_im001", false]]))
    db.appendLlmLog(meaningfulness("pg001", "2026-06-01T10:00:00.000Z", "old prompt", ["logo", "figure-a"], [["pg001_im001", false], ["pg001_im002", true]], { cacheHit: true, durationMs: 5 }))
    db.appendLlmLog(meaningfulness("pg002", "2026-06-01T10:00:01.000Z", "new prompt", ["logo"], [["pg002_im001", false]], { durationMs: 2500 }))
    db.appendLlmLog(meaningfulness("pg002", "2026-06-01T10:00:02.000Z", "new prompt", ["logo"], [], { success: false, error: "boom", durationMs: 100, usage: undefined }))
    db.markStepCompleted("extract", "page 2/2")
    db.markStepCompleted("image-meaningfulness", "2/2")
  })
  const report = reportExtract(root, "scanned")
  expect(report.pages).toMatchObject({ count: 3, withoutText: 3, textProfile: "image-only", totalChars: 0 })
  expect(report.images).toMatchObject({ extracted: 4, distinctHashes: 3, duplicates: 1, perPageMean: 1.3, perPageMax: 2, bySource: { "extract/vector": 3, "extract/raster": 1 }, debug: { groupsBeforeMerge: 5, groupsAfterMerge: 2, textOnlyGroupsSkipped: 1 } })
  expect(report.filtering).toMatchObject({ classified: 6, pruned: 5, byReason: { "full-page render": 2, "not meaningful": 2, min_side: 1 }, sentToLlm: 3, meaningful: 1, notMeaningful: 2, maxImagesPerCall: 2, unreadablePages: 1 })
  expect(report.verdicts).toEqual({ pg001_im001: false, pg001_im002: true, pg002_im001: false })
  expect(report.tasks).toHaveLength(1)
  expect(report.tasks[0]).toMatchObject({ task: "image-meaningfulness", model: "openai:gpt-5.4", calls: 5, cacheHits: 1, misses: { firstRun: 2, promptChanged: 1, unknown: 1 }, failures: 1, inputTokens: 4000, outputTokens: 200, maxDurationMs: 2500 })
  expect(report.tasks[0].estimatedCostUsd).toBeCloseTo((4000 * 2.5 + 200 * 15) / 1_000_000, 6)
  expect(report.pageRows.map((row) => [row.pageId, row.extractedImages, row.duplicateImages, row.pruned, row.sentToLlm, row.meaningful, row.notMeaningful])).toEqual([["pg001", 2, 0, 2, 2, 1, 1], ["pg002", 2, 1, 3, 1, 0, 1], ["pg003", 0, 0, 0, 0, 0, 0]])
  expect(report.findings).toEqual([
    "image-only source: 3/3 pages have no text layer, so metadata, book summary and book outline run without text",
    "1 of 4 extracted images are byte-identical copies of an image on another page",
    "image-meaningfulness completed but 1 call(s) failed in the log",
    "1 image-meaningfulness call(s) missed the cache because the prompt changed since the previous run",
    "1 page(s) have an image-filtering row that cannot be read; their pruning is not counted",
    "the meaningfulness model rejected 2 of 3 images it was sent",
  ])
  const formatted = formatExtractReport(report)
  expect(formatted).toContain("scanned: schema")
  expect(formatted).toContain("text layer: 0/3 pages with text")
  expect(formatted).toContain("images: 4 extracted (3 distinct, 1 duplicates)")
  expect(formatted).toContain("image-meaningfulness (openai:gpt-5.4): 5 calls, 1 cached (20%), misses: firstRun 2, promptChanged 1, unknown 1; 1 failed")
  expect(formatted).toContain("! image-only source")
  expect(extractReportCsv([report], "pages").split("\n")[1]).toBe("scanned,pg001,1,0,2,0,2,2,1,1,1000,5")
  expect(extractReportCsv([report], "tasks").split("\n")[1]).toMatch(/^scanned,image-meaningfulness,openai:gpt-5\.4,5,1,2,1,0,0,0,1,1,0,4000,200,/)
})

it("diffs two reports of the same PDF: changed metrics and flipped verdicts", () => {
  for (const [label, verdict, tokens] of [["before", true, 1000], ["after", false, 700]] as const) {
    seed(label, (db) => {
      db.putExtractedPage(page("pg001", 1, "Enough text to count as a text layer here.", [image("pg001_im001", "pg001", "figure")]))
      db.appendLlmLog(meaningfulness("pg001", "2026-05-01T10:00:00.000Z", "prompt", ["figure"], [["pg001_im001", verdict]], { usage: { inputTokens: tokens, outputTokens: 10 } }))
    })
  }
  const diff = diffExtractReports(reportExtract(root, "before"), reportExtract(root, "after"))
  expect(diff.verdictFlips).toEqual([{ imageId: "pg001_im001", a: true, b: false }])
  expect(diff.deltas).toContainEqual({ metric: "tasks.image-meaningfulness[openai:gpt-5.4].inputTokens", a: 1000, b: 700, delta: -300 })
  expect(diff.deltas.map((delta) => delta.metric)).toContain("filtering.meaningful")
  expect(formatExtractReportDiff(diff)).toContain("before → after:")
  expect(formatExtractReportDiff(diff)).toContain("verdict pg001_im001: meaningful → not meaningful")
})

it("reports a missing database as an error and lists every book under the directory", () => {
  seed("one", (db) => db.putExtractedPage(page("pg001", 1, "Some text layer content on the page.")))
  fs.mkdirSync(path.join(root, "two"))
  fs.mkdirSync(path.join(root, "one", "one.db.lock"))
  const locked = reportExtract(root, "one")
  expect(locked.error).toBe("stale lock directory one.db.lock; remove it before opening this book")
  expect(formatExtractReport(locked)).toBe("one: schema unknown · ERROR stale lock directory one.db.lock; remove it before opening this book")
  fs.rmdirSync(path.join(root, "one", "one.db.lock"))
  expect(reportExtract(root, "two")).toMatchObject({ error: "no database file", pages: { count: 0 } })
  expect(hasExtractFindings(reportExtract(root, "two"))).toBe(true)
  expect(reportExtracts(root).map((report) => report.label)).toEqual(["one"])
  expect(formatExtractReport(reportExtract(root, "two"))).toBe("two: schema unknown · ERROR no database file")
})
