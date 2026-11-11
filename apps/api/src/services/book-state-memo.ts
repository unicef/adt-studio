import fs from "node:fs"
import path from "node:path"
import type { Storage } from "@adt/storage"

function stamp(file: string): string {
  const s = fs.statSync(file, { bigint: true, throwIfNoEntry: false })
  return s ? [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":") : "-"
}

/** Identity of a book's saved state for derived read models. Every supported
 * save adds or selects a node version and rewrites the SQLite file, so both
 * the version fingerprint and the database file identity must be unchanged
 * for a derived result to be reused. Cheap: one indexed query and two stats. */
export function bookStateKey(storage: Storage, bookDir: string): string {
  const db = path.join(bookDir, `${path.basename(bookDir)}.db`)
  return JSON.stringify([storage.getNodeVersionFingerprint(), stamp(db), stamp(`${db}-wal`)])
}

/** Bounded in-process memo for results derived purely from saved book state.
 * Polled read models (step status, library, package status) otherwise rescan
 * every page's sectioning and rendering on each request. No timers, no
 * persisted state; a changed key recomputes. */
export function createBookStateMemo<T>(limit = 32) {
  const entries = new Map<string, T>()
  return (key: string, compute: () => T): T => {
    if (entries.has(key)) return entries.get(key) as T
    const value = compute()
    if (entries.size >= limit) entries.delete(entries.keys().next().value!)
    entries.set(key, value)
    return value
  }
}
