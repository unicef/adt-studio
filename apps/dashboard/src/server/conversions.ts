import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { computeMetrics } from "../lib/metrics"
import { asString, asTime, parseCall } from "../lib/parse-call"
import type { ConversionEntry, ConversionListing, ConversionSummary, LlmCall, StepRun } from "../lib/types"

const { Database } = sqlite

interface ConversionFiles {
  entry: ConversionEntry
  db: string
  pdf: string | null
  config: string | null
}

async function isDirectory(target: string) {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function fileOrNull(target: string) {
  try {
    return (await fs.stat(target)).isFile() ? target : null
  } catch {
    return null
  }
}

async function conversionFiles(dir: string): Promise<ConversionFiles | null> {
  const name = path.basename(dir)
  let db = await fileOrNull(path.join(dir, `${name}.db`))
  if (!db) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const other = entries.find((e) => e.isFile() && e.name.endsWith(".db"))
    db = other ? path.join(dir, other.name) : null
  }
  if (!db) return null
  const base = path.basename(db, ".db")
  const stat = await fs.stat(db)
  return {
    entry: { name, dbModified: stat.mtimeMs, dbSize: stat.size },
    db,
    pdf: await fileOrNull(path.join(dir, `${base}.pdf`)),
    config: await fileOrNull(path.join(dir, "config.yaml")),
  }
}

export function defaultFolder(start = process.cwd()): string | null {
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml")) && existsSync(path.join(dir, "books"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function listConversions(folder: string): Promise<ConversionListing> {
  const resolved = path.resolve(folder)
  if (!(await isDirectory(resolved))) throw new Error(`Folder not found: ${resolved}`)

  const own = await conversionFiles(resolved)
  if (own) return { folder: resolved, booksDir: path.dirname(resolved), conversions: [own.entry] }

  const books = path.join(resolved, "books")
  const booksDir = (await isDirectory(books)) ? books : resolved
  const entries = await fs.readdir(booksDir, { withFileTypes: true })
  const conversions: ConversionEntry[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    const found = await conversionFiles(path.join(booksDir, entry.name))
    if (found) conversions.push(found.entry)
  }
  conversions.sort((a, b) => b.dbModified - a.dbModified)
  return { folder: resolved, booksDir, conversions }
}

export function resolveConversionDir(booksDir: string, name: string): string {
  const base = path.resolve(booksDir)
  const dir = path.resolve(base, name)
  if (name === "." || name === ".." || /[\\/]/.test(name) || path.dirname(dir) !== base) {
    throw new Error(`Invalid conversion name: ${name}`)
  }
  return dir
}

function readDatabase(dbPath: string): { steps: StepRun[]; calls: LlmCall[] } {
  const db = new Database(dbPath, { readOnly: true, fileMustExist: true })
  try {
    const tables = new Set((db.all("select name from sqlite_master where type = 'table'") as { name: string }[]).map((r) => r.name))
    if (!tables.has("llm_log")) throw new Error(`${path.basename(dbPath)}: the database has no llm_log table`)
    const steps: StepRun[] = tables.has("step_runs")
      ? (db.all("select step, status, started_at, completed_at, message from step_runs") as Record<string, unknown>[]).map((r) => ({
          step: String(r.step),
          status: String(r.status),
          startedAt: asTime(r.started_at),
          completedAt: asTime(r.completed_at),
          message: asString(r.message) ?? "",
        }))
      : []
    const calls = (db.all("select id, step, json_remove(data, '$.messages') as data from llm_log order by id") as Record<string, unknown>[])
      .map((r) => parseCall(Number(r.id), String(r.data), String(r.step ?? "")))
      .filter((c): c is LlmCall => c !== null)
    return { steps, calls }
  } finally {
    db.close()
  }
}

function coverPageNumber(db: InstanceType<typeof Database>): number | null {
  const [row] = db.all("select data from node_data where node = 'metadata' and item_id = 'book' order by version desc limit 1") as { data: string }[]
  if (!row) return null
  try {
    const parsed = JSON.parse(row.data) as { cover_page_number?: unknown }
    return typeof parsed.cover_page_number === "number" ? parsed.cover_page_number : null
  } catch {
    return null
  }
}

function coverImagePath(dbPath: string): string | null {
  const db = new Database(dbPath, { readOnly: true, fileMustExist: true })
  try {
    const tables = new Set((db.all("select name from sqlite_master where type = 'table'") as { name: string }[]).map((r) => r.name))
    if (!tables.has("pages") || !tables.has("images")) return null
    const pageNumber = tables.has("node_data") ? coverPageNumber(db) : null
    const [page] = (
      pageNumber !== null
        ? db.all("select page_id from pages where page_number = ? limit 1", [pageNumber])
        : db.all("select page_id from pages order by page_number asc limit 1")
    ) as { page_id: string }[]
    if (!page) return null
    const [image] = db.all("select path from images where image_id = ?", [`${page.page_id}_page`]) as { path: string }[]
    return image ? image.path : null
  } finally {
    db.close()
  }
}

const COVER_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }

export async function readCover(booksDir: string, name: string): Promise<{ bytes: Buffer; type: string } | null> {
  const dir = resolveConversionDir(booksDir, name)
  const files = await conversionFiles(dir)
  if (!files) return null
  const relative = coverImagePath(files.db)
  if (!relative) return null
  const file = path.resolve(dir, relative)
  const type = COVER_TYPES[path.extname(file).toLowerCase()]
  if (!type || !file.startsWith(dir + path.sep) || !(await fileOrNull(file))) return null
  return { bytes: await fs.readFile(file), type }
}

export async function readConversion(booksDir: string, name: string): Promise<ConversionSummary> {
  const dir = resolveConversionDir(booksDir, name)
  const files = await conversionFiles(dir)
  if (!files) throw new Error(`No conversion database found in ${dir}`)
  const { steps, calls } = readDatabase(files.db)
  const pdfModified = files.pdf ? (await fs.stat(files.pdf)).mtimeMs : null
  const pdfHash = files.pdf ? createHash("sha256").update(await fs.readFile(files.pdf)).digest("hex") : null
  const config = files.config ? await fs.readFile(files.config, "utf8") : null
  return {
    name,
    pdfHash,
    config,
    metrics: computeMetrics({ name, pdfModified, pdfHash, config, steps, calls }),
  }
}
