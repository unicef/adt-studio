import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, BookMetadata, PIPELINE, ProjectIdentity } from "@adt/types"
import { renderPdfCover } from "@adt/pdf"
import { openBookDb } from "@adt/storage"
import { getBook, type BookSummary } from "./book-service.js"
import { PROJECT_IDENTITY_FILE } from "./project-identity.js"
import { ADT_IMPORT_CURRENT_FILE } from "./adt-import/source.js"
import {
  ArchiveSafetyError,
  extractArchiveToDisk,
  inspectArchivePaths,
  readArchiveEntries,
} from "./archive-safety.js"

export interface ImportResult extends BookSummary {}

function throwInvalidArchive(message: string): never {
  throw new HTTPException(400, { message })
}

function throwCorruptProject(message: string): never {
  throw new HTTPException(500, { message })
}

export interface ImportPreview {
  label: string
  title: string | null
  authors: string[]
  publisher: string | null
  languageCode: string | null
  pageCount: number
  hasSourcePdf: boolean
  imageCount: number
  videoCount: number
  coverBase64: string | null
  stages: Record<string, { status: string; stepCount: number; doneCount: number }>
  validationError: string | null
}

function resolveUniqueLabel(baseLabel: string, booksDir: string): string {
  const resolvedDir = path.resolve(booksDir)
  if (!fs.existsSync(path.join(resolvedDir, baseLabel))) {
    return baseLabel
  }
  let n = 2
  while (fs.existsSync(path.join(resolvedDir, `${baseLabel}-${n}`))) {
    n++
  }
  return `${baseLabel}-${n}`
}

function asInvalidArchive<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throwInvalidArchive(error.message)
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOSPC") {
      throw new HTTPException(507, { message: "Not enough disk space to import this archive" })
    }
    // Anything else (an HTTP error from a path check, a disk error) is not a
    // broken archive; let it through unchanged.
    throw error
  }
}

/** Entry names only; nothing is inflated. */
function listArchivePaths(zipBuffer: Buffer): string[] {
  return asInvalidArchive(() => inspectArchivePaths(zipBuffer))
}

const NOT_ADT_PROJECT = "Invalid project archive: expected a .db and .pdf file at the root level"

/**
 * A backup needs its source PDF, except for a book created by ADT import:
 * it never had one, and works from its recorded ADT import instead. One rule
 * for preview and import, so the preview can't promise an import that fails.
 */
function missingSourceProblem(
  zipBuffer: Buffer,
  filePaths: string[],
): string | null {
  if (findEntry(filePaths, ".pdf")) return null
  // Both the identity and the import marker (which names the stored source
  // archive) must be there, or the restored book would have no source at all.
  if (!filePaths.includes(PROJECT_IDENTITY_FILE) || !filePaths.includes(ADT_IMPORT_CURRENT_FILE)) return NOT_ADT_PROJECT
  const raw = asInvalidArchive(() => readArchiveEntries(zipBuffer, [PROJECT_IDENTITY_FILE]))[PROJECT_IDENTITY_FILE]
  try {
    const identity = ProjectIdentity.parse(JSON.parse(new TextDecoder().decode(raw)))
    return identity.sourceKind === "imported-adt" ? null : NOT_ADT_PROJECT
  } catch {
    return NOT_ADT_PROJECT
  }
}

function findEntry(filePaths: string[], ext: string): string | undefined {
  return filePaths.find((p) => p.endsWith(ext) && !p.includes("/"))
}

interface DbMetadata {
  title: string | null
  authors: string[]
  publisher: string | null
  languageCode: string | null
  pageCount: number
  validationError: string | null
  /** True when the DB couldn't be opened/read (corrupt). False for structural mismatches (invalid archive). */
  validationCorrupt: boolean
  stages: ImportPreview["stages"]
}

function readDbMetadata(dbPath: string): DbMetadata {
  let title: string | null = null
  let authors: string[] = []
  let publisher: string | null = null
  let languageCode: string | null = null
  let pageCount = 0
  let validationError: string | null = null
  let validationCorrupt = false
  const stages: ImportPreview["stages"] = {}

  try {
    const db = openBookDb(dbPath)
    try {
      const tables = db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pages', 'node_data', 'step_runs')",
      ) as Array<{ name: string }>
      const tableNames = new Set(tables.map((t) => t.name))

      if (!tableNames.has("pages") || !tableNames.has("node_data")) {
        validationError = "The database does not contain the expected ADT tables. This may not be a valid ADT Studio project."
      } else {
        const pages = db.all("SELECT COUNT(*) as count FROM pages") as Array<{ count: number }>
        pageCount = pages[0]?.count ?? 0

        if (pageCount === 0) {
          validationError = "The database contains no pages. This project may be incomplete or corrupted."
        }

        const metaRows = db.all(
          "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
          ["metadata", "book"],
        ) as Array<{ data: string }>
        if (metaRows.length > 0) {
          const parsed = BookMetadata.safeParse(JSON.parse(metaRows[0].data))
          if (parsed.success) {
            title = parsed.data.title
            authors = parsed.data.authors
            publisher = parsed.data.publisher
            languageCode = parsed.data.language_code
          }
        }

        if (tableNames.has("step_runs")) {
          const stepRuns = db.all("SELECT step, status FROM step_runs") as Array<{
            step: string
            status: string
          }>

          for (const stage of PIPELINE) {
            const stageSteps: string[] = stage.steps.map((s) => s.name)
            const matching = stepRuns.filter((r) => stageSteps.includes(r.step))
            stages[stage.name] = {
              status: matching.length === 0
                ? "pending"
                : matching.every((r) => r.status === "done")
                  ? "done"
                  : matching.some((r) => r.status === "error")
                    ? "error"
                    : matching.some((r) => r.status === "running")
                      ? "running"
                      : "partial",
              stepCount: stageSteps.length,
              doneCount: matching.filter((r) => r.status === "done").length,
            }
          }
        }
      }
    } finally {
      db.close()
    }
  } catch {
    validationError = "Could not read the project database. The file may be corrupted or not a valid ADT Studio project."
    validationCorrupt = true
  }

  return { title, authors, publisher, languageCode, pageCount, validationError, validationCorrupt, stages }
}

export function previewImport(zipBuffer: Buffer): ImportPreview {
  const filePaths = listArchivePaths(zipBuffer)

  const dbEntry = findEntry(filePaths, ".db")
  if (!dbEntry) throwInvalidArchive(NOT_ADT_PROJECT)
  const rawLabel = dbEntry.replace(/\.db$/, "")
  const safeLabel = parseBookLabel(rawLabel)

  const pdfEntry = findEntry(filePaths, ".pdf")
  // Only the database and the source PDF are needed for the preview.
  const entries = asInvalidArchive(() =>
    readArchiveEntries(zipBuffer, pdfEntry ? [dbEntry, pdfEntry] : [dbEntry]),
  )
  const imageCount = filePaths.filter((p) => p.startsWith("images/") && !p.endsWith("/")).length
  const videoCount = filePaths.filter((p) => p.startsWith("videos/") && !p.endsWith("/")).length

  let coverBase64: string | null = null
  if (pdfEntry) {
    const pdfBuffer = Buffer.from(entries[pdfEntry])
    const coverPng = renderPdfCover(pdfBuffer, { maxWidth: 320 })
    if (coverPng) {
      coverBase64 = coverPng.toString("base64")
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-"))
  const tmpDbPath = path.join(tmpDir, `${safeLabel}.db`)
  try {
    fs.writeFileSync(tmpDbPath, entries[dbEntry])
    const { validationCorrupt: _, ...meta } = readDbMetadata(tmpDbPath)

    return {
      label: safeLabel,
      ...meta,
      validationError: meta.validationError ?? missingSourceProblem(zipBuffer, filePaths),
      hasSourcePdf: !!pdfEntry,
      imageCount,
      videoCount,
      coverBase64,
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

export async function importProject(
  zipBuffer: Buffer,
  booksDir: string,
): Promise<ImportResult> {
  const filePaths = listArchivePaths(zipBuffer)

  const dbEntry = findEntry(filePaths, ".db")
  if (!dbEntry) throwInvalidArchive(NOT_ADT_PROJECT)
  const rawLabel = dbEntry.replace(/\.db$/, "")

  const sourceProblem = missingSourceProblem(zipBuffer, filePaths)
  if (sourceProblem) throwInvalidArchive(sourceProblem)

  const safeLabel = parseBookLabel(rawLabel)
  const targetLabel = resolveUniqueLabel(safeLabel, booksDir)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, targetLabel)

  fs.mkdirSync(bookDir, { recursive: true })

  try {
    const destinationFor = (entryPath: string): string => {
      const renamedPath = entryPath.startsWith(`${rawLabel}.`)
        ? entryPath.replace(rawLabel, targetLabel)
        : entryPath

      const destPath = path.join(bookDir, renamedPath)

      if (!destPath.startsWith(bookDir + path.sep) && destPath !== bookDir) {
        throwInvalidArchive("Invalid project archive: contains paths that escape the project directory")
      }
      return destPath
    }

    // Check the database before writing anything else, so a broken backup
    // never fills the disk. Then write the rest in bounded batches; large
    // backups are never expanded in memory as a whole.
    asInvalidArchive(() => extractArchiveToDisk(zipBuffer, (entryPath) =>
      entryPath === dbEntry ? destinationFor(entryPath) : null))
    const dbPath = path.join(bookDir, `${targetLabel}.db`)
    const meta = readDbMetadata(dbPath)

    if (meta.validationError) {
      if (meta.validationCorrupt) throwCorruptProject(meta.validationError)
      throwInvalidArchive(meta.validationError)
    }

    asInvalidArchive(() => extractArchiveToDisk(zipBuffer, (entryPath) =>
      entryPath === dbEntry ? null : destinationFor(entryPath)))

    return getBook(targetLabel, booksDir)
  } catch (err) {
    try {
      fs.rmSync(bookDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      console.error(`[import] Failed to clean up partial book dir ${bookDir}:`, cleanupErr)
    }
    throw err
  }
}
