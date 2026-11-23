import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Written while an ADT import is seeding a project directory and removed once
 * the import commits. `listBooks` skips directories that still carry it, so a
 * crashed import never surfaces as a usable book.
 */
export const ADT_IMPORT_IN_PROGRESS_MARKER = ".adt-recovery-workspace.json"

/** An import older than this is abandoned even when its owner can't be checked
 * (another host, or a marker without an owner). */
const ABANDONED_IMPORT_AGE_MS = 24 * 60 * 60 * 1000

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Is this marker an import whose process is gone? Only a marker this design
 * writes (`version: 1`) counts; anything else is left alone. */
function isAbandoned(markerPath: string, now: number): boolean {
  let marker: { version?: unknown; createdAt?: unknown; pid?: unknown; hostname?: unknown }
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8"))
  } catch {
    return false
  }
  if (!marker || marker.version !== 1) return false
  const createdAt = typeof marker.createdAt === "string" ? Date.parse(marker.createdAt) : NaN
  if (typeof marker.pid === "number" && marker.hostname === os.hostname()) {
    // The sweep runs at startup, before this process imports anything, so a
    // marker naming this very pid came from an earlier process that reused it
    // (a restarted container keeps its hostname and often gets pid 1 again).
    return marker.pid === process.pid || !processIsAlive(marker.pid)
  }
  return Number.isFinite(createdAt) && now - createdAt > ABANDONED_IMPORT_AGE_MS
}

/**
 * Remove book folders an ADT import was still seeding when its process died.
 * Run at API startup. A folder is removed only when its marker names a
 * process on this host that is no longer running, or (when that can't be
 * checked) the import started more than a day ago, so an import another
 * process or container is running on a shared books folder is never touched.
 * Returns the labels it removed.
 */
export function removeAbandonedAdtImports(booksDir: string, now = Date.now()): string[] {
  const resolved = path.resolve(booksDir)
  if (!fs.existsSync(resolved)) return []
  const removed: string[] = []
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bookDir = path.join(resolved, entry.name)
    const markerPath = path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER)
    if (!fs.existsSync(markerPath) || !isAbandoned(markerPath, now)) continue
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
