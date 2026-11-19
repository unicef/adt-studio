/**
 * Shared prologue for the read-only book inspectors (`doctor`, `extract-report`):
 * where a book's database lives, whether an interrupted process left a lock
 * directory, and whether its schema is one this version may open without
 * migrating it. Opening an older book would migrate it and a newer one would
 * be refused, so inspectors only open books whose schema is `current`.
 */
import fs from "node:fs"
import path from "node:path"
import { readBookSchemaVersion } from "@adt/storage"
import { SCHEMA_VERSION } from "@adt/types"

export type SchemaStatus = "current" | "older" | "newer" | "unreadable"

export interface BookInspection {
  bookDir: string
  dbPath: string
  schemaVersion: number | null
  schemaStatus: SchemaStatus
  /** `<label>.db.lock` directory left by an interrupted process. */
  staleLockDir: boolean
  /** Why the book must not be opened; the inspector reports it and stops. */
  error?: string
}

export function inspectBookFile(booksDir: string, label: string): BookInspection {
  const bookDir = path.join(path.resolve(booksDir), label)
  const dbPath = path.join(bookDir, `${label}.db`)
  const inspection: BookInspection = { bookDir, dbPath, schemaVersion: null, schemaStatus: "unreadable", staleLockDir: fs.existsSync(`${dbPath}.lock`) }
  if (!fs.existsSync(dbPath)) return { ...inspection, error: "no database file" }
  if (inspection.staleLockDir) {
    // Opening would fail with "database is locked"; nothing else is provable.
    return { ...inspection, error: `stale lock directory ${label}.db.lock; remove it before opening this book` }
  }
  try {
    inspection.schemaVersion = readBookSchemaVersion(dbPath)
  } catch (error) {
    return { ...inspection, error: `cannot read schema: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (inspection.schemaVersion === null) return inspection
  inspection.schemaStatus = inspection.schemaVersion === SCHEMA_VERSION ? "current" : inspection.schemaVersion < SCHEMA_VERSION ? "older" : "newer"
  return inspection
}

/** Every `<label>/<label>.db` under a books directory, in name order. */
export function listBookLabels(booksDir: string): string[] {
  const root = path.resolve(booksDir)
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root).filter((entry) => fs.existsSync(path.join(root, entry, `${entry}.db`))).sort()
}
