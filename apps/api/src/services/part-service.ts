import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import yaml from "js-yaml"
import { unzipSync } from "fflate"
import { HTTPException } from "hono/http-exception"
import type sqlite from "node-sqlite3-wasm"
import {
  parseBookLabel,
  BookMetadata,
  PartManifest,
  PartsLedger,
  PIPELINE,
  type AppConfig,
  type PartRange,
} from "@adt/types"
import {
  PER_PAGE_PROMPT_KEYS,
  computeFingerprint,
  canonicalJson,
  hashPdfBytes,
} from "@adt/types/fingerprint"
import { renderPdfCover, countPdfPages } from "@adt/pdf"
import { CURRENT_VERSION_ORDER, openBookDb, resolveBookPaths } from "@adt/storage"
import { loadBookConfig } from "@adt/pipeline"
import { createZipStreamFromEntries } from "./zip-util.js"
import { getBookConfig, readPartInfo, type BookSummary } from "./book-service.js"
import type { ExportResult } from "./export-service.js"

/**
 * The per-page processing stages. A merge carries the part's step status for
 * every step in these stages onto the assembled book. This deliberately
 * includes the Extract stage's non-page-level `metadata` and `book-summary`
 * steps: stage completion requires *every* step to be done/skipped, so clearing
 * `book-summary` would make the whole Extract stage read as "not run" and block
 * the downstream UI (e.g. the Sectioning page's "Extract hasn't run" gate).
 */
const PER_PAGE_STAGE_NAMES = new Set<string>(["extract", "sectioning", "storyboard"])
const PER_PAGE_STAGE_STEPS = new Set<string>(
  PIPELINE.filter((s) => PER_PAGE_STAGE_NAMES.has(s.name)).flatMap((s) =>
    s.steps.map((st) => st.name),
  ),
)
/** Steps of the downstream / book-level stages, cleared on merge so the UI
 *  flags them for re-running on the assembled book. */
const DOWNSTREAM_STEPS = PIPELINE.filter((s) => !PER_PAGE_STAGE_NAMES.has(s.name)).flatMap((s) =>
  s.steps.map((st) => st.name),
)
const DOWNSTREAM_STAGE_NAMES = PIPELINE.filter((s) => !PER_PAGE_STAGE_NAMES.has(s.name)).map(
  (s) => s.name,
)

/** Config fields whose drift the semantics tier reports (per-page prompts +
 *  editing language). */
const SEMANTIC_DIFF_KEYS: string[] = [...PER_PAGE_PROMPT_KEYS, "editing_language"]

function diffSemanticKeys(target: AppConfig, incoming: AppConfig): string[] {
  const a = target as unknown as Record<string, unknown>
  const b = incoming as unknown as Record<string, unknown>
  return SEMANTIC_DIFF_KEYS.filter((k) => canonicalJson(a[k]) !== canonicalJson(b[k]))
}

function throwInvalid(message: string): never {
  throw new HTTPException(400, { message })
}

function unzipBuffer(zipBuffer: Buffer): Record<string, Uint8Array> {
  try {
    return unzipSync(zipBuffer)
  } catch {
    throwInvalid("That file isn't a valid .zip archive.")
  }
}

/** Root-level entry (no slash) matching an extension. */
function findRootEntry(filePaths: string[], ext: string): string | undefined {
  return filePaths.find((p) => p.endsWith(ext) && !p.includes("/"))
}

function resolveUniqueLabel(baseLabel: string, booksDir: string): string {
  const resolvedDir = path.resolve(booksDir)
  if (!fs.existsSync(path.join(resolvedDir, baseLabel))) return baseLabel
  let n = 2
  while (fs.existsSync(path.join(resolvedDir, `${baseLabel}-${n}`))) n++
  return `${baseLabel}-${n}`
}

/**
 * Snap a page window to spread boundaries. Spreads pair (2,3),(4,5),… with page
 * 1 standalone (see packages/pdf extract spread mode), so a window must start on
 * page 1 or an even page, and end on page 1 or an odd page (or the last page).
 */
function snapSpreadRange(range: PartRange, pageCount: number): PartRange {
  let { startPage, endPage } = range
  if (startPage > 1 && startPage % 2 === 1) startPage -= 1
  if (endPage > 1 && endPage % 2 === 0 && endPage < pageCount) endPage += 1
  return { startPage, endPage: Math.min(endPage, pageCount) }
}

function readPdfBytes(bookDir: string, label: string): Buffer {
  const pdfPath = path.join(bookDir, `${label}.pdf`)
  if (!fs.existsSync(pdfPath)) {
    throw new HTTPException(404, { message: `Source PDF not found for ${label}` })
  }
  return fs.readFileSync(pdfPath)
}

// ---------------------------------------------------------------------------
// Split tracking — coordinator-side ledger of exported parts + merge coverage
// ---------------------------------------------------------------------------

function ledgerPath(bookDir: string): string {
  return path.join(bookDir, "parts-ledger.json")
}

function readLedger(bookDir: string): PartsLedger {
  const p = ledgerPath(bookDir)
  if (!fs.existsSync(p)) return { exported: [], merged: [] }
  try {
    const parsed = PartsLedger.safeParse(JSON.parse(fs.readFileSync(p, "utf-8")))
    return parsed.success ? parsed.data : { exported: [], merged: [] }
  } catch {
    return { exported: [], merged: [] }
  }
}

/** Record (or refresh) an exported page range in the coordinator's ledger. */
function recordExportedRange(
  bookDir: string,
  range: PartRange,
  at: string,
  pageCount: number,
): void {
  const prev = readLedger(bookDir)
  const exported = prev.exported.filter(
    (e) => !(e.startPage === range.startPage && e.endPage === range.endPage),
  )
  exported.push({ startPage: range.startPage, endPage: range.endPage, at })
  exported.sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage)
  const ledger: PartsLedger = { exported, merged: prev.merged, pageCount }
  fs.writeFileSync(ledgerPath(bookDir), JSON.stringify(ledger, null, 2) + "\n")
}

/** Record a merged page range in the coordinator's ledger. This is what marks a
 *  book as genuinely assembled from parts — distinct from the pages-present
 *  coverage, which every extracted book has. */
function recordMergedRange(bookDir: string, range: PartRange, at: string): void {
  const prev = readLedger(bookDir)
  const merged = prev.merged.filter(
    (e) => !(e.startPage === range.startPage && e.endPage === range.endPage),
  )
  merged.push({ startPage: range.startPage, endPage: range.endPage, at })
  merged.sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage)
  const ledger: PartsLedger = { exported: prev.exported, merged, pageCount: prev.pageCount }
  fs.writeFileSync(ledgerPath(bookDir), JSON.stringify(ledger, null, 2) + "\n")
}

/** Contiguous uncovered ranges over 1..pageCount given a set of covered ranges. */
export function gapsOf(ranges: PartRange[], pageCount: number): PartRange[] {
  if (pageCount <= 0) return []
  const covered = new Array<boolean>(pageCount + 1).fill(false)
  for (const r of ranges) {
    for (let p = Math.max(1, r.startPage); p <= Math.min(pageCount, r.endPage); p++) covered[p] = true
  }
  const gaps: PartRange[] = []
  let start: number | null = null
  for (let p = 1; p <= pageCount; p++) {
    if (!covered[p] && start === null) start = p
    if (covered[p] && start !== null) {
      gaps.push({ startPage: start, endPage: p - 1 })
      start = null
    }
  }
  if (start !== null) gaps.push({ startPage: start, endPage: pageCount })
  return gaps
}

/** Collapse a list of page numbers into contiguous inclusive ranges. */
export function contiguousRanges(pages: number[]): PartRange[] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const out: PartRange[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && p === last.endPage + 1) last.endPage = p
    else out.push({ startPage: p, endPage: p })
  }
  return out
}

function pagesPresent(bookDir: string, label: string): number[] {
  const dbPath = path.join(bookDir, `${label}.db`)
  if (!fs.existsSync(dbPath)) return []
  const db = openBookDb(dbPath)
  try {
    const rows = db.all("SELECT page_number FROM pages ORDER BY page_number") as Array<{
      page_number: number
    }>
    return rows.map((r) => r.page_number)
  } finally {
    db.close()
  }
}

export interface SplitStatus {
  pageCount: number
  /** Page ranges already exported as parts (sorted). */
  exported: PartRange[]
  /** Ranges not yet exported. */
  exportGaps: PartRange[]
  /** First un-exported gap — the split UI defaults the picker to this. */
  nextGap: PartRange | null
  /** Every page is covered by an exported part. */
  fullySplit: boolean
  /** Pages present in the book (merged from parts or extracted), as ranges. */
  mergedRanges: PartRange[]
  /** Pages not yet present (missing parts). */
  missingRanges: PartRange[]
  /** Every page is present. */
  fullyMerged: boolean
  /** At least one part has actually been merged into this book (from the
   *  ledger, not inferred from pages present). Distinguishes a genuinely
   *  assembled coordinator book from a normally-extracted whole book. */
  hasMergeActivity: boolean
}

export function computeSplitStatus(label: string, booksDir: string): SplitStatus {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const pageCount = countPdfPages(readPdfBytes(bookDir, safeLabel))

  const ledger = readLedger(bookDir)
  const exported = ledger.exported.map((e) => ({
    startPage: e.startPage,
    endPage: e.endPage,
  }))
  const exportGaps = gapsOf(exported, pageCount)

  const mergedRanges = contiguousRanges(pagesPresent(bookDir, safeLabel))
  const missingRanges = gapsOf(mergedRanges, pageCount)

  return {
    pageCount,
    exported,
    exportGaps,
    nextGap: exportGaps[0] ?? null,
    fullySplit: pageCount > 0 && exportGaps.length === 0,
    mergedRanges,
    missingRanges,
    fullyMerged: pageCount > 0 && missingRanges.length === 0,
    hasMergeActivity: ledger.merged.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Part export (coordinator -> contributor)
// ---------------------------------------------------------------------------

export interface ExportPartOptions {
  startPage: number
  endPage: number
}

export function exportPart(
  label: string,
  booksDir: string,
  range: ExportPartOptions,
  configPath?: string,
): ExportResult {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)
  if (!fs.existsSync(bookDir)) {
    throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  }

  const pdfBytes = readPdfBytes(bookDir, safeLabel)
  const pageCount = countPdfPages(pdfBytes)
  const config = loadBookConfig(safeLabel, resolvedDir, configPath)

  let window: PartRange = {
    startPage: Math.max(1, range.startPage),
    endPage: Math.min(range.endPage, pageCount),
  }
  if (window.endPage < window.startPage) {
    throwInvalid("endPage must be greater than or equal to startPage")
  }
  if (config.spread_mode) {
    window = snapSpreadRange(window, pageCount)
  }

  const fingerprint = computeFingerprint({ config, pdfSha256: hashPdfBytes(pdfBytes) })

  // Title (best-effort) from stored metadata.
  let title: string | null = null
  const paths = resolveBookPaths(safeLabel, resolvedDir)
  if (fs.existsSync(paths.dbPath)) {
    const db = openBookDb(paths.dbPath)
    try {
      const rows = db.all(
        "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["metadata", "book"],
      ) as Array<{ data: string }>
      if (rows.length > 0) {
        const parsed = BookMetadata.safeParse(JSON.parse(rows[0].data))
        if (parsed.success) title = parsed.data.title
      }
    } finally {
      db.close()
    }
  }

  // Part config = the book's own overrides + the page window. Writing overrides
  // (not the fully-resolved config) keeps the contributor's environment-level
  // base config in play; any divergence is what the semantics tier flags.
  const overrides = (getBookConfig(safeLabel, resolvedDir) ?? {}) as Record<string, unknown>
  const partConfig = { ...overrides, start_page: window.startPage, end_page: window.endPage }

  const partLabelSuggestion = `${safeLabel}-p${String(window.startPage).padStart(3, "0")}-${String(window.endPage).padStart(3, "0")}`

  const manifest: PartManifest = {
    adtPart: 1,
    sourceLabel: safeLabel,
    title,
    range: window,
    pageCount,
    fingerprint,
    identityHash: fingerprint.identityHash,
    semanticsHash: fingerprint.semanticsHash,
    createdAt: new Date().toISOString(),
    partLabelSuggestion,
  }

  // Remember this range was split off, so the UI can default to the next gap
  // and report when the whole book has been split.
  recordExportedRange(bookDir, window, manifest.createdAt, pageCount)

  const enc = new TextEncoder()
  const stream = createZipStreamFromEntries([
    { path: "part.json", data: enc.encode(JSON.stringify(manifest, null, 2) + "\n") },
    { path: `${safeLabel}.pdf`, data: new Uint8Array(pdfBytes) },
    { path: "config.yaml", data: enc.encode(yaml.dump(partConfig)) },
  ])

  const baseName = `${title ?? safeLabel}-part-${window.startPage}-${window.endPage}`
  return {
    stream,
    filename: `${baseName}.zip`,
    safeFilename: `${partLabelSuggestion}.zip`,
  }
}

// ---------------------------------------------------------------------------
// Part import (contributor)
// ---------------------------------------------------------------------------

export interface PartImportPreview {
  isPart: true
  label: string
  sourceLabel: string
  title: string | null
  range: PartRange
  pageCount: number
  coverBase64: string | null
}

function parseManifest(entries: Record<string, Uint8Array>): PartManifest {
  const raw = entries["part.json"]
  if (!raw) throwInvalid("This file isn't a book part. Choose the part file that was shared with you.")
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(raw).toString("utf-8"))
  } catch {
    throwInvalid("This part file looks corrupted and can't be read.")
  }
  const parsed = PartManifest.safeParse(json)
  if (!parsed.success) throwInvalid("This part file is invalid or corrupted.")
  return parsed.data
}

/** A part archive carries part.json at the root; project archives carry a .db. */
export function isPartArchive(zipBuffer: Buffer): boolean {
  const entries = unzipBuffer(zipBuffer)
  return "part.json" in entries && !findRootEntry(Object.keys(entries), ".db")
}

export function previewImportPart(zipBuffer: Buffer): PartImportPreview {
  const entries = unzipBuffer(zipBuffer)
  const manifest = parseManifest(entries)

  const pdfEntry = findRootEntry(Object.keys(entries), ".pdf")
  let coverBase64: string | null = null
  if (pdfEntry) {
    const cover = renderPdfCover(Buffer.from(entries[pdfEntry]), { maxWidth: 320 })
    if (cover) coverBase64 = cover.toString("base64")
  }

  return {
    isPart: true,
    label: parseBookLabel(manifest.partLabelSuggestion),
    sourceLabel: manifest.sourceLabel,
    title: manifest.title,
    range: manifest.range,
    pageCount: manifest.pageCount,
    coverBase64,
  }
}

export function importPart(zipBuffer: Buffer, booksDir: string): BookSummary {
  const entries = unzipBuffer(zipBuffer)
  const manifest = parseManifest(entries)
  const pdfEntry = findRootEntry(Object.keys(entries), ".pdf")
  if (!pdfEntry) throwInvalid("This part file is incomplete: its PDF is missing.")

  const baseLabel = parseBookLabel(manifest.partLabelSuggestion)
  const targetLabel = resolveUniqueLabel(baseLabel, booksDir)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, targetLabel)
  fs.mkdirSync(bookDir, { recursive: true })

  try {
    fs.writeFileSync(path.join(bookDir, `${targetLabel}.pdf`), Buffer.from(entries[pdfEntry]))
    if (entries["config.yaml"]) {
      fs.writeFileSync(path.join(bookDir, "config.yaml"), Buffer.from(entries["config.yaml"]))
    }
    // Remember this book is a part (used for the badge and re-export).
    fs.writeFileSync(path.join(bookDir, "part.json"), Buffer.from(entries["part.json"]))

    const nowIso = new Date().toISOString()
    return {
      label: targetLabel,
      title: manifest.title,
      authors: [],
      publisher: null,
      languageCode: null,
      pageCount: 0,
      hasSourcePdf: true,
      needsRebuild: false,
      rebuildReason: null,
      completedStages: [],
      createdAt: nowIso,
      modifiedAt: nowIso,
      part: { sourceLabel: manifest.sourceLabel, range: manifest.range },
      split: null,
    }
  } catch (err) {
    try { fs.rmSync(bookDir, { recursive: true, force: true }) } catch { /* ignore */ }
    throw err
  }
}

export interface PartInfo {
  sourceLabel: string
  range: PartRange
}

/** If this book was imported as a part, return its source + window; else null. */
export function getPartInfo(label: string, booksDir: string): PartInfo | null {
  const bookDir = path.join(path.resolve(booksDir), parseBookLabel(label))
  return readPartInfo(bookDir)
}

// ---------------------------------------------------------------------------
// Merge (coordinator)
// ---------------------------------------------------------------------------

export interface MergePreview {
  targetLabel: string
  sourceLabel: string
  title: string | null
  range: PartRange
  identityMatch: boolean
  semanticsMatch: boolean
  /** Config keys whose values differ between the part and the target (only
   *  populated when semanticsMatch is false). */
  semanticsDiff: string[]
  blocked: boolean
  blockReason: string | null
  warnings: string[]
  addedPageNumbers: number[]
  replacedPageNumbers: number[]
  /** Per per-page node: how many in-window pages carry data for it. */
  coverage: Array<{ node: string; pages: number }>
}

export interface MergeResult {
  targetLabel: string
  addedPages: number
  replacedPages: number
  staleSteps: string[]
  /** The page set changed, so the whole-book summary is now stale and should be
   *  regenerated on the assembled book (kept separate from staleSteps because
   *  book-summary lives in the Extract stage and must stay "done" there). */
  bookSummaryStale: boolean
  semanticsOverridden: boolean
  /** The part covered page 1 and carried the book's metadata (title/authors/
   *  publisher), which the target lacked — so it was populated by this merge. */
  metadataMerged: boolean
}

/** Page id (pg051 / pg002003) a node_data item_id belongs to, if any. */
function pageIdOfItem(itemId: string): string | null {
  const m = itemId.match(/^(pg\d+)(?:_|$)/)
  return m ? m[1] : null
}

interface ExtractedPart {
  /** Books-root containing the part's label directory (temp dir). */
  booksRoot: string
  /** The part's own book directory (`booksRoot/rawLabel`). */
  dir: string
  rawLabel: string
  db: sqlite.Database
}

/** Write a part project zip to a temp book dir and open its DB. Returns the
 *  decoded archive entries so callers don't have to unzip the (large) project
 *  buffer again. Caller must call `cleanup()`. */
function openPartProject(zipBuffer: Buffer): {
  part: ExtractedPart
  entries: Record<string, Uint8Array>
  cleanup: () => void
} {
  const entries = unzipBuffer(zipBuffer)
  const filePaths = Object.keys(entries)
  const dbEntry = findRootEntry(filePaths, ".db")
  if (!dbEntry) {
    throwInvalid(
      "This .zip isn't a completed part. Open the part, export it from its Export step as a Completed Part, and upload that file.",
    )
  }
  if (!("part.json" in entries)) {
    throwInvalid("This looks like a regular project, not a book part. Only parts exported from this book can be merged back.")
  }
  const rawLabel = parseBookLabel(dbEntry.replace(/\.db$/, ""))

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-merge-"))
  const dir = path.join(tmpRoot, rawLabel)
  fs.mkdirSync(dir, { recursive: true })

  for (const [entryPath, data] of Object.entries(entries)) {
    const dest = path.join(dir, entryPath)
    if (!dest.startsWith(dir + path.sep)) throwInvalid("This .zip contains unexpected file paths and can't be opened safely.")
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
  }

  let db: sqlite.Database
  try {
    db = openBookDb(path.join(dir, `${rawLabel}.db`))
  } catch (err) {
    // The caller only gets `cleanup` on success, so remove the temp dir here
    // if opening the part's DB fails (e.g. a corrupt archive).
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    throw err
  }
  return {
    part: { booksRoot: tmpRoot, dir, rawLabel, db },
    entries,
    cleanup: () => {
      try { db.close() } catch { /* ignore */ }
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    },
  }
}

function resolvedFingerprint(label: string, booksDir: string, configPath?: string): {
  config: AppConfig
  identityHash: string
  semanticsHash: string
} {
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, label)
  const pdfBytes = readPdfBytes(bookDir, label)
  const config = loadBookConfig(label, resolvedDir, configPath)
  const fp = computeFingerprint({ config, pdfSha256: hashPdfBytes(pdfBytes) })
  return { config, identityHash: fp.identityHash, semanticsHash: fp.semanticsHash }
}

function inWindowPages(
  db: sqlite.Database,
  range: PartRange,
): Array<{ page_id: string; page_number: number; text: string }> {
  return db.all(
    "SELECT page_id, page_number, text FROM pages WHERE page_number BETWEEN ? AND ? ORDER BY page_number",
    [range.startPage, range.endPage],
  ) as Array<{ page_id: string; page_number: number; text: string }>
}

function targetPageIds(label: string, booksDir: string): Set<string> {
  const paths = resolveBookPaths(label, path.resolve(booksDir))
  if (!fs.existsSync(paths.dbPath)) return new Set()
  const db = openBookDb(paths.dbPath)
  try {
    const rows = db.all("SELECT page_id FROM pages") as Array<{ page_id: string }>
    return new Set(rows.map((r) => r.page_id))
  } finally {
    db.close()
  }
}

export function previewMerge(
  targetLabel: string,
  booksDir: string,
  zipBuffer: Buffer,
  configPath?: string,
): MergePreview {
  const safeTarget = parseBookLabel(targetLabel)
  const { part, entries, cleanup } = openPartProject(zipBuffer)
  try {
    const manifest = parseManifest(entries)

    const target = resolvedFingerprint(safeTarget, booksDir, configPath)
    const incoming = resolvedFingerprint(part.rawLabel, part.booksRoot, configPath)
    const identityMatch = target.identityHash === incoming.identityHash
    const semanticsMatch = target.semanticsHash === incoming.semanticsHash
    const semanticsDiff = semanticsMatch ? [] : diffSemanticKeys(target.config, incoming.config)

    const warnings: string[] = []
    if (!semanticsMatch) {
      const where = semanticsDiff.length > 0 ? ` (differs in: ${semanticsDiff.join(", ")})` : ""
      warnings.push(
        `This part was processed with different prompts, models, or editing language than the target book${where}. Pages still align, but their generated structure may differ.`,
      )
    }

    const pages = inWindowPages(part.db, manifest.range)
    const existing = targetPageIds(safeTarget, booksDir)
    const addedPageNumbers: number[] = []
    const replacedPageNumbers: number[] = []
    for (const p of pages) {
      if (existing.has(p.page_id)) replacedPageNumbers.push(p.page_number)
      else addedPageNumbers.push(p.page_number)
    }

    const pageIdSet = new Set(pages.map((p) => p.page_id))
    const nodeRows = part.db.all(
      "SELECT DISTINCT node, item_id FROM node_data",
    ) as Array<{ node: string; item_id: string }>
    const coverageMap = new Map<string, Set<string>>()
    for (const row of nodeRows) {
      const pid = pageIdOfItem(row.item_id)
      if (!pid || !pageIdSet.has(pid)) continue
      if (!coverageMap.has(row.node)) coverageMap.set(row.node, new Set())
      coverageMap.get(row.node)!.add(pid)
    }
    const coverage = [...coverageMap.entries()]
      .map(([node, pids]) => ({ node, pages: pids.size }))
      .sort((a, b) => a.node.localeCompare(b.node))

    return {
      targetLabel: safeTarget,
      sourceLabel: manifest.sourceLabel,
      title: manifest.title,
      range: manifest.range,
      identityMatch,
      semanticsMatch,
      semanticsDiff,
      blocked: !identityMatch,
      blockReason: identityMatch
        ? null
        : "This part was extracted from a different PDF, spread mode, or schema version than the target book. Page ids do not line up, so it cannot be merged.",
      warnings,
      addedPageNumbers,
      replacedPageNumbers,
      coverage,
    }
  } finally {
    cleanup()
  }
}

export interface MergeOptions {
  /** Proceed even if the semantics fingerprint differs (coordinator override). */
  acknowledgeSemanticsMismatch?: boolean
}

function copyMissingFiles(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name)
    const dest = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyMissingFiles(src, dest)
    } else if (entry.isFile() && !fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }
  }
}

export function mergePart(
  targetLabel: string,
  booksDir: string,
  zipBuffer: Buffer,
  options: MergeOptions = {},
  configPath?: string,
): MergeResult {
  const safeTarget = parseBookLabel(targetLabel)
  const resolvedDir = path.resolve(booksDir)
  const targetPaths = resolveBookPaths(safeTarget, resolvedDir)

  const { part, entries, cleanup } = openPartProject(zipBuffer)
  try {
    const manifest = parseManifest(entries)

    const target = resolvedFingerprint(safeTarget, booksDir, configPath)
    const incoming = resolvedFingerprint(part.rawLabel, part.booksRoot, configPath)
    if (target.identityHash !== incoming.identityHash) {
      throwInvalid(
        "Cannot merge: this part was extracted from a different PDF, spread mode, or schema version than the target book.",
      )
    }
    const semanticsMatch = target.semanticsHash === incoming.semanticsHash
    if (!semanticsMatch && !options.acknowledgeSemanticsMismatch) {
      const diff = diffSemanticKeys(target.config, incoming.config)
      const where = diff.length > 0 ? ` (differs in: ${diff.join(", ")})` : ""
      throw new HTTPException(409, {
        message: `This part was processed with different prompts/models than the target book${where}. Re-submit with acknowledgement to merge anyway.`,
      })
    }

    const pages = inWindowPages(part.db, manifest.range)
    const pageIdSet = new Set(pages.map((p) => p.page_id))
    const existing = targetPageIds(safeTarget, booksDir)
    let addedPages = 0
    let replacedPages = 0
    let metadataMerged = false
    for (const p of pages) {
      if (existing.has(p.page_id)) replacedPages++
      else addedPages++
    }

    // Current version of every node_data row in the part. A contributor may
    // have intentionally restored an older version, so MAX(version) is not
    // necessarily the version that should be merged.
    const orderedNodes = part.db.all(
      `SELECT nd.node AS node, nd.item_id AS item_id, nd.data AS data
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         ORDER BY nd.node, nd.item_id, ${CURRENT_VERSION_ORDER}`,
    ) as Array<{ node: string; item_id: string; data: string | null }>
    const currentNodes: typeof orderedNodes = []
    const seenNodes = new Set<string>()
    for (const row of orderedNodes) {
      const key = `${row.node}\0${row.item_id}`
      if (seenNodes.has(key)) continue
      seenNodes.add(key)
      currentNodes.push(row)
    }
    const perPageNodes = currentNodes.filter((row) => {
      const pid = pageIdOfItem(row.item_id)
      return pid !== null && pageIdSet.has(pid)
    })

    const images = part.db.all(
      `SELECT image_id, page_id, path, hash, width, height, source, render_method,
              bounds_x, bounds_y, bounds_w, bounds_h
         FROM images WHERE page_id IN (${pages.map(() => "?").join(", ") || "''"})`,
      pages.map((p) => p.page_id),
    ) as Array<{
      image_id: string
      page_id: string
      path: string
      hash: string
      width: number
      height: number
      source: string
      render_method: string | null
      bounds_x: number | null
      bounds_y: number | null
      bounds_w: number | null
      bounds_h: number | null
    }>

    const partStepRuns = part.db.all(
      "SELECT step, status FROM step_runs",
    ) as Array<{ step: string; status: string }>

    const targetDb = openBookDb(targetPaths.dbPath)
    try {
      targetDb.exec("BEGIN IMMEDIATE")

      for (const p of pages) {
        targetDb.run(
          `INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)
           ON CONFLICT (page_id) DO UPDATE SET page_number = excluded.page_number, text = excluded.text`,
          [p.page_id, p.page_number, p.text],
        )
      }

      // Current max version per (node, item_id) in one pass, so the insert loop
      // doesn't issue a SELECT per row.
      const maxVersions = new Map<string, number>()
      for (const r of targetDb.all(
        "SELECT node, item_id, MAX(version) AS mv FROM node_data GROUP BY node, item_id",
      ) as Array<{ node: string; item_id: string; mv: number | null }>) {
        maxVersions.set(`${r.node} ${r.item_id}`, r.mv ?? 0)
      }
      for (const row of perPageNodes) {
        const key = `${row.node} ${row.item_id}`
        const nextVersion = (maxVersions.get(key) ?? 0) + 1
        maxVersions.set(key, nextVersion)
        targetDb.run(
          "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
          [row.node, row.item_id, nextVersion, row.data],
        )
        targetDb.run(
          `INSERT INTO node_current (node, item_id, version) VALUES (?, ?, ?)
           ON CONFLICT (node, item_id) DO UPDATE SET version = excluded.version`,
          [row.node, row.item_id, nextVersion],
        )
      }

      // Book-level metadata (title/authors/publisher/language/cover) is the one
      // book-level node a part can carry authoritatively: it's extracted from the
      // first pages, so only the part covering page 1 has real values (mid-book
      // parts derive garbage from their own first pages). A split-coordinator book
      // is never extracted, so without this it would have NO metadata after merge
      // — no title, and the Extract "Edit metadata" button stays hidden (it gates
      // on the metadata node existing). Copy it once, when absent, so it doesn't
      // clobber a later manual edit; the coordinator can edit or re-extract after.
      if (manifest.range.startPage === 1) {
        const targetHasMetadata =
          (targetDb.all(
            "SELECT 1 FROM node_data WHERE node = 'metadata' AND item_id = 'book' LIMIT 1",
          ) as unknown[]).length > 0
        const metaRow = currentNodes.find((r) => r.node === "metadata" && r.item_id === "book")
        if (!targetHasMetadata && metaRow) {
          targetDb.run(
            "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
            ["metadata", "book", 1, metaRow.data],
          )
          targetDb.run(
            "INSERT INTO node_current (node, item_id, version) VALUES (?, ?, ?)",
            ["metadata", "book", 1],
          )
          metadataMerged = true
        }
      }

      for (const img of images) {
        targetDb.run(
          `INSERT INTO images
             (image_id, page_id, path, hash, width, height, source, render_method, bounds_x, bounds_y, bounds_w, bounds_h)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (image_id) DO UPDATE SET
             page_id = excluded.page_id, path = excluded.path, hash = excluded.hash,
             width = excluded.width, height = excluded.height, source = excluded.source,
             render_method = excluded.render_method, bounds_x = excluded.bounds_x,
             bounds_y = excluded.bounds_y, bounds_w = excluded.bounds_w, bounds_h = excluded.bounds_h`,
          [
            img.image_id, img.page_id, img.path, img.hash, img.width, img.height,
            img.source, img.render_method, img.bounds_x, img.bounds_y, img.bounds_w, img.bounds_h,
          ],
        )
      }

      // Carry the part's status for every step in the per-page stages
      // (extract/sectioning/storyboard, incl. metadata + book-summary) so the
      // assembled book's early stages read as complete. Stage completion needs
      // every step done/skipped, so we must NOT leave any of these unset.
      for (const sr of partStepRuns) {
        if (PER_PAGE_STAGE_STEPS.has(sr.step) && (sr.status === "done" || sr.status === "skipped")) {
          targetDb.run(
            `INSERT INTO step_runs (step, status) VALUES (?, ?)
             ON CONFLICT (step) DO UPDATE SET status = excluded.status`,
            [sr.step, sr.status],
          )
        }
      }

      // Downstream / book-level stages are now computed over a stale page set →
      // clear so the UI flags them for re-running on the assembled book.
      if (DOWNSTREAM_STEPS.length > 0) {
        const placeholders = DOWNSTREAM_STEPS.map(() => "?").join(", ")
        targetDb.run(`DELETE FROM step_runs WHERE step IN (${placeholders})`, DOWNSTREAM_STEPS)
      }

      // Carry per-item artifacts (so the stale book-level re-run is cheap) while
      // the transaction is still open: a failed copy must roll back the DB, or
      // the committed image/node rows would reference files missing on disk.
      copyMissingFiles(path.join(part.dir, "images"), targetPaths.imagesDir)
      copyMissingFiles(path.join(part.dir, ".cache"), path.join(targetPaths.bookDir, ".cache"))
      copyMissingFiles(path.join(part.dir, "audio"), path.join(targetPaths.bookDir, "audio"))
      copyMissingFiles(path.join(part.dir, "videos"), targetPaths.videosDir)

      targetDb.exec("COMMIT")
    } catch (err) {
      try { targetDb.exec("ROLLBACK") } catch { /* ignore */ }
      throw err
    } finally {
      targetDb.close()
    }

    // Mark the coordinator as genuinely assembled from parts, so the split/merge
    // panel stays visible for merge-only books (which carry no export ledger).
    recordMergedRange(targetPaths.bookDir, manifest.range, manifest.createdAt)

    return {
      targetLabel: safeTarget,
      addedPages,
      replacedPages,
      staleSteps: DOWNSTREAM_STAGE_NAMES,
      bookSummaryStale: addedPages + replacedPages > 0,
      semanticsOverridden: !semanticsMatch,
      metadataMerged,
    }
  } finally {
    cleanup()
  }
}
