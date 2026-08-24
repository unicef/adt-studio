import fs from "node:fs"
import path from "node:path"

import { parseBookLabel } from "@adt/types"

/**
 * Marker written by the ADT importer. Its presence is the single definition of
 * "this project's working source is imported HTML rather than a source PDF",
 * and it names the immutable source revision every later projection reads from.
 */
export const ADT_IMPORT_CURRENT_FILE = ".adt-import-current.json"

const ADT_IMPORT_REVISIONS_DIR = ".adt-imports"

export class ImportedAdtSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImportedAdtSourceError"
  }
}

export interface ImportedAdtCurrent {
  revisionId: string
  importedAt: string
  projectionVersion?: number
}

export function bookDirFor(label: string, booksDir: string): string {
  return path.join(path.resolve(booksDir), parseBookLabel(label))
}

export function isImportedAdtProject(bookDir: string): boolean {
  return fs.existsSync(path.join(bookDir, ADT_IMPORT_CURRENT_FILE))
}

export function isImportedAdtProjectLabel(label: string, booksDir: string): boolean {
  return isImportedAdtProject(bookDirFor(label, booksDir))
}

export function readImportedAdtCurrent(bookDir: string): ImportedAdtCurrent & Record<string, unknown> {
  const currentPath = path.join(bookDir, ADT_IMPORT_CURRENT_FILE)
  let value: unknown
  try {
    value = JSON.parse(fs.readFileSync(currentPath, "utf8"))
  } catch {
    throw new ImportedAdtSourceError("Imported ADT revision metadata could not be read")
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ImportedAdtSourceError("Imported ADT revision metadata could not be read")
  }
  const record = value as Record<string, unknown>
  const revisionId = record.revisionId
  if (
    typeof revisionId !== "string"
    || path.basename(revisionId) !== revisionId
    || revisionId.includes("..")
  ) {
    throw new ImportedAdtSourceError("Imported ADT revision metadata could not be read")
  }
  return record as ImportedAdtCurrent & Record<string, unknown>
}

export function writeImportedAdtCurrent(bookDir: string, value: Record<string, unknown>): void {
  const filePath = path.join(bookDir, ADT_IMPORT_CURRENT_FILE)
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
}

export function importedAdtRevisionDir(bookDir: string, revisionId: string): string {
  return path.join(bookDir, ADT_IMPORT_REVISIONS_DIR, revisionId)
}

/** The archive this project was imported from. Every re-projection reads it
 * instead of the book's own generated output, so an upgrade can never compound
 * an earlier projection's mistakes. */
export function readImportedAdtSourceArchive(bookDir: string): Buffer {
  const { revisionId } = readImportedAdtCurrent(bookDir)
  try {
    return fs.readFileSync(path.join(importedAdtRevisionDir(bookDir, revisionId), "source.zip"))
  } catch {
    throw new ImportedAdtSourceError("Imported ADT source archive could not be read")
  }
}
