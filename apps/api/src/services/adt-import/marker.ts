import fs from "node:fs"
import path from "node:path"

/**
 * Written while an ADT import is seeding a project directory and removed once
 * the import commits. `listBooks` skips directories that still carry it, so a
 * crashed import never surfaces as a usable book.
 */
export const ADT_IMPORT_IN_PROGRESS_MARKER = ".adt-recovery-workspace.json"

/**
 * Remove book folders an ADT import was still seeding when the process died.
 * Run at API startup, when no import of this process can be in progress, so
 * a crash leaves neither a hidden folder on disk nor a taken label. Returns
 * the labels it removed.
 */
export function removeAbandonedAdtImports(booksDir: string): string[] {
  const resolved = path.resolve(booksDir)
  if (!fs.existsSync(resolved)) return []
  const removed: string[] = []
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bookDir = path.join(resolved, entry.name)
    if (!fs.existsSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER))) continue
    try {
      fs.rmSync(bookDir, { recursive: true, force: true })
      removed.push(entry.name)
    } catch (error) {
      console.warn(`[adt-import] could not remove abandoned import ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (removed.length > 0) {
    console.warn(`[adt-import] removed ${removed.length} import(s) interrupted by a previous shutdown: ${removed.join(", ")}`)
  }
  return removed
}
