import path from "node:path"
import { readBookContentIdentity, type Storage } from "@adt/storage"

/** Content writes and unexplained file changes invalidate derived read models.
 * Storage preserves identity only for proven telemetry-only statements. */
export function bookStateKey(storage: Storage, bookDir: string): string {
  const db = path.join(bookDir, `${path.basename(bookDir)}.db`)
  return JSON.stringify([storage.getNodeVersionFingerprint(), readBookContentIdentity(db)])
}

/** Bounded in-process memo for results derived purely from saved book state.
 * Polled read models (step status, library, package status) otherwise rescan
 * every page's sectioning and rendering on each request. No timers, no
 * persisted state; a changed key recomputes. */
export function createBookStateMemo<T>(bookLimit = 128, variantLimit = 4) {
  const entries = new Map<string, { generation: string; variants: Map<string, T> }>()
  return (bookDir: string, generation: string, variant: string, compute: () => T): T => {
    const previous = entries.get(bookDir)
    const entry = previous?.generation === generation ? previous : { generation, variants: new Map<string, T>() }
    const value = entry.variants.has(variant) ? entry.variants.get(variant) as T : compute()
    entry.variants.delete(variant)
    if (entry.variants.size >= variantLimit) entry.variants.delete(entry.variants.keys().next().value!)
    entry.variants.set(variant, value)
    // One current generation per book: repeated edits cannot fill the cache
    // with obsolete results and evict every other Library card.
    entries.delete(bookDir)
    if (entries.size >= bookLimit) entries.delete(entries.keys().next().value!)
    entries.set(bookDir, entry)
    return value
  }
}
