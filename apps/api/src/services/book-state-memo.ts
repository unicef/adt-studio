import path from "node:path"
import { readBookContentIdentity, type Storage } from "@adt/storage"

/** Identity of a book's saved state for derived read models. Content writes and unexplained file changes invalidate. The storage boundary
 * preserves identity only for proven telemetry-only statements. */
export function bookStateKey(storage: Storage, bookDir: string): string {
  const db = path.join(bookDir, `${path.basename(bookDir)}.db`)
  return JSON.stringify([storage.getNodeVersionFingerprint(), readBookContentIdentity(db)])
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
