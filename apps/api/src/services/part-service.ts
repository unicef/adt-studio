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
  PAGE_PROGRESS_STEPS,
  computeFingerprint,
  hashPdfBytes,
  type PartRange,
} from "@adt/types"
import { renderPdfCover, countPdfPages } from "@adt/pdf"
import { openBookDb, resolveBookPaths } from "@adt/storage"
import { loadBookConfig } from "@adt/pipeline"
import { createZipStreamFromEntries } from "./zip-util.js"
import { getBookConfig, type BookSummary } from "./book-service.js"
import type { ExportResult } from "./export-service.js"

/**
 * Book-level steps re-run on the assembled book after a merge. Their step_runs
 * are cleared so the UI shows them as needing a run; the underlying per-item
 * caches are carried by the merge so re-running is cheap (see plan). `metadata`
 * is intentionally excluded — it is derived from the first pages and drives the
 * editing language every downstream step depends on; clearing it would be
 * destructive, not just stale.
 */
const BOOK_LEVEL_STALE_STEPS = [
  "book-summary",
  "quiz-generation",
  "glossary",
  "toc-generation",
  "text-catalog",
  "easy-read",
  "catalog-translation",
  "image-translation",
  "tts",
  "word-timestamps",
  "package-web",
  "accessibility-assessment",
] as const

function throwInvalid(message: string): never {
  throw new HTTPException(400, { message })
}

function unzipBuffer(zipBuffer: Buffer): Record<string, Uint8Array> {
  try {
    return unzipSync(zipBuffer)
  } catch {
    throwInvalid("Invalid ZIP file")
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
  if (!raw) throwInvalid("Not a part archive: missing part.json")
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(raw).toString("utf-8"))
  } catch {
    throwInvalid("part.json is not valid JSON")
  }
  const parsed = PartManifest.safeParse(json)
  if (!parsed.success) throwInvalid(`Invalid part.json: ${parsed.error.message}`)
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
  if (!pdfEntry) throwInvalid("Part archive is missing its PDF")

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
  const manifestPath = path.join(bookDir, "part.json")
  if (!fs.existsSync(manifestPath)) return null
  try {
    const parsed = PartManifest.safeParse(JSON.parse(fs.readFileSync(manifestPath, "utf-8")))
    if (!parsed.success) return null
    return { sourceLabel: parsed.data.sourceLabel, range: parsed.data.range }
  } catch {
    return null
  }
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
  semanticsOverridden: boolean
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

/** Write a part project zip to a temp book dir and open its DB. Caller must
 *  call `cleanup()`. */
function openPartProject(zipBuffer: Buffer): { part: ExtractedPart; cleanup: () => void } {
  const entries = unzipBuffer(zipBuffer)
  const filePaths = Object.keys(entries)
  const dbEntry = findRootEntry(filePaths, ".db")
  if (!dbEntry) throwInvalid("Not a completed-part project: missing .db at the archive root")
  if (!("part.json" in entries)) {
    throwInvalid("Not a part project: missing part.json (export the part as a project)")
  }
  const rawLabel = parseBookLabel(dbEntry.replace(/\.db$/, ""))

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-merge-"))
  const dir = path.join(tmpRoot, rawLabel)
  fs.mkdirSync(dir, { recursive: true })

  for (const [entryPath, data] of Object.entries(entries)) {
    const dest = path.join(dir, entryPath)
    if (!dest.startsWith(dir + path.sep)) throwInvalid("Part archive contains unsafe paths")
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
  }

  const db = openBookDb(path.join(dir, `${rawLabel}.db`))
  return {
    part: { booksRoot: tmpRoot, dir, rawLabel, db },
    cleanup: () => {
      try { db.close() } catch { /* ignore */ }
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    },
  }
}

function fingerprintOf(label: string, booksDir: string, configPath?: string): {
  identityHash: string
  semanticsHash: string
} {
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, label)
  const pdfBytes = readPdfBytes(bookDir, label)
  const config = loadBookConfig(label, resolvedDir, configPath)
  const fp = computeFingerprint({ config, pdfSha256: hashPdfBytes(pdfBytes) })
  return { identityHash: fp.identityHash, semanticsHash: fp.semanticsHash }
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
  const { part, cleanup } = openPartProject(zipBuffer)
  try {
    const entries = unzipBuffer(zipBuffer)
    const manifest = parseManifest(entries)

    const target = fingerprintOf(safeTarget, booksDir, configPath)
    const incoming = fingerprintOf(part.rawLabel, part.booksRoot, configPath)
    const identityMatch = target.identityHash === incoming.identityHash
    const semanticsMatch = target.semanticsHash === incoming.semanticsHash

    const warnings: string[] = []
    if (!semanticsMatch) {
      warnings.push(
        "This part was processed with different prompts, models, or editing language than the target book. Pages still align, but their generated structure may differ.",
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

  const { part, cleanup } = openPartProject(zipBuffer)
  try {
    const entries = unzipBuffer(zipBuffer)
    const manifest = parseManifest(entries)

    const target = fingerprintOf(safeTarget, booksDir, configPath)
    const incoming = fingerprintOf(part.rawLabel, part.booksRoot, configPath)
    if (target.identityHash !== incoming.identityHash) {
      throwInvalid(
        "Cannot merge: this part was extracted from a different PDF, spread mode, or schema version than the target book.",
      )
    }
    const semanticsMatch = target.semanticsHash === incoming.semanticsHash
    if (!semanticsMatch && !options.acknowledgeSemanticsMismatch) {
      throw new HTTPException(409, {
        message:
          "This part was processed with different prompts/models than the target book. Re-submit with acknowledgement to merge anyway.",
      })
    }

    const pages = inWindowPages(part.db, manifest.range)
    const pageIdSet = new Set(pages.map((p) => p.page_id))
    const existing = targetPageIds(safeTarget, booksDir)
    let addedPages = 0
    let replacedPages = 0
    for (const p of pages) {
      if (existing.has(p.page_id)) replacedPages++
      else addedPages++
    }

    // Latest version of every node_data row in the part.
    const latestNodes = part.db.all(
      `SELECT nd.node, nd.item_id, nd.data
         FROM node_data nd
         JOIN (SELECT node, item_id, MAX(version) AS mv FROM node_data GROUP BY node, item_id) m
           ON nd.node = m.node AND nd.item_id = m.item_id AND nd.version = m.mv`,
    ) as Array<{ node: string; item_id: string; data: string | null }>
    const perPageNodes = latestNodes.filter((row) => {
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

      for (const row of perPageNodes) {
        const max = targetDb.all(
          "SELECT MAX(version) AS mv FROM node_data WHERE node = ? AND item_id = ?",
          [row.node, row.item_id],
        ) as Array<{ mv: number | null }>
        const nextVersion = (max[0]?.mv ?? 0) + 1
        targetDb.run(
          "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
          [row.node, row.item_id, nextVersion, row.data],
        )
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

      // Per-page steps the part completed: mark done on the assembled book.
      // (Page-level data presence is the source of truth; this keeps the stage
      // badge consistent. Re-running is cache-cheap if a page was missed.)
      for (const sr of partStepRuns) {
        if (sr.status === "done" && PAGE_PROGRESS_STEPS.has(sr.step as never)) {
          targetDb.run(
            `INSERT INTO step_runs (step, status) VALUES (?, 'done')
             ON CONFLICT (step) DO UPDATE SET status = 'done'`,
            [sr.step],
          )
        }
      }

      // Book-level outputs are now computed over a stale page set → mark stale.
      const placeholders = BOOK_LEVEL_STALE_STEPS.map(() => "?").join(", ")
      targetDb.run(
        `DELETE FROM step_runs WHERE step IN (${placeholders})`,
        [...BOOK_LEVEL_STALE_STEPS],
      )

      targetDb.exec("COMMIT")
    } catch (err) {
      try { targetDb.exec("ROLLBACK") } catch { /* ignore */ }
      throw err
    } finally {
      targetDb.close()
    }

    // Carry per-item artifacts so the stale book-level re-run is cheap.
    copyMissingFiles(path.join(part.dir, "images"), targetPaths.imagesDir)
    copyMissingFiles(path.join(part.dir, ".cache"), path.join(targetPaths.bookDir, ".cache"))
    copyMissingFiles(path.join(part.dir, "audio"), path.join(targetPaths.bookDir, "audio"))
    copyMissingFiles(path.join(part.dir, "videos"), targetPaths.videosDir)

    return {
      targetLabel: safeTarget,
      addedPages,
      replacedPages,
      staleSteps: [...BOOK_LEVEL_STALE_STEPS],
      semanticsOverridden: !semanticsMatch,
    }
  } finally {
    cleanup()
  }
}
