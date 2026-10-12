import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { RenderCachePublication } from "@adt/types"
import { assertBookWriter, atomicBookFile, syncDirectory, type Storage } from "@adt/storage"
import { inputSignature } from "./output-freshness.js"

export const RENDER_CACHE_JOURNAL = ".render-cache-publication.json"
function regular(file: string): boolean {
  try { if (!fs.lstatSync(file).isFile()) throw new Error("Unsafe cache publication path"); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
}
function roots(storage: Storage, attemptId: string) {
  const book = fs.realpathSync(storage.bookDir!)
  const cache = path.join(book, ".cache")
  fs.mkdirSync(cache, { recursive: true })
  if (!fs.lstatSync(cache).isDirectory()) throw new Error("Unsafe cache directory")
  const attempt = path.join(book, `.render-cache-attempt-${attemptId}`)
  return { book, cache, attempt, journal: path.join(book, RENDER_CACHE_JOURNAL) }
}

/** A flushed intent precedes cache activation. The SQLite output versions are
 * the commit receipt: recovery never invokes a provider or guesses from time. */
export function recoverRenderCachePublication(storage: Storage): void {
  assertBookWriter(storage.bookDir!)
  const journal = path.join(storage.bookDir!, RENDER_CACHE_JOURNAL)
  if (!regular(journal)) return
  const record = RenderCachePublication.parse(JSON.parse(fs.readFileSync(journal, "utf8")))
  const r = roots(storage, record.attemptId)
  if (!fs.lstatSync(r.attempt).isDirectory()) throw new Error("Unsafe cache recovery directory")
  const committed = record.renderings.every((target) => {
    const row = storage.getAllNodeVersions("web-rendering", target.pageId).find((row) => row.version === target.version)
    return row !== undefined && inputSignature(row.data) === target.signature
  })
  if (!committed) for (const entry of record.entries) {
    const destination = path.join(r.cache, `${entry.hash}.json`)
    regular(destination)
    if (entry.existed) {
      const previous = path.join(r.attempt, `${entry.hash}.previous`)
      if (!regular(previous)) throw new Error("Missing cache predecessor; recovery requires inspection")
      atomicBookFile(destination, fs.readFileSync(previous, "utf8"))
    } else if (fs.existsSync(destination)) fs.unlinkSync(destination)
  }
  syncDirectory(r.cache)
  fs.unlinkSync(r.journal)
  syncDirectory(r.book)
  // Attempt files are retained as recovery evidence; none are active cache keys.
}

/** Shared explicit-render cache writes remain in memory until output admission
 * and validation succeed. A failed publication restores the exact prior bytes. */
export function createRenderCachePublication(storage: Storage) {
  assertBookWriter(storage.bookDir!)
  recoverRenderCachePublication(storage)
  const pending = new Map<string, string>()
  const cacheDir = path.join(fs.realpathSync(storage.bookDir!), ".cache")
  return {
    write(cache: string, hash: string, value: unknown) {
      if (path.join(fs.realpathSync(path.dirname(cache)), path.basename(cache)) !== cacheDir || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid staged cache key")
      pending.set(hash, JSON.stringify(value, null, 2) + "\n")
    },
    publish(renderings: Array<{ pageId: string; version: number; signature: string }>, commit: () => void) {
      if (!pending.size) { commit(); return }
      const r = roots(storage, randomUUID())
      fs.mkdirSync(r.attempt)
      const entries = [...pending.keys()].map((hash) => {
        const file = path.join(r.cache, `${hash}.json`)
        const existed = regular(file)
        if (existed) atomicBookFile(path.join(r.attempt, `${hash}.previous`), fs.readFileSync(file, "utf8"))
        return { hash, existed }
      })
      const record = RenderCachePublication.parse({ version: 1, attemptId: path.basename(r.attempt).slice(".render-cache-attempt-".length), entries, renderings })
      atomicBookFile(r.journal, JSON.stringify(record))
      try {
        for (const [hash, content] of pending) atomicBookFile(path.join(r.cache, `${hash}.json`), content)
        commit()
      } catch (error) {
        recoverRenderCachePublication(storage)
        throw error
      }
      // If cleanup fails after SQLite committed, keep the intent for recovery;
      // committed output must not be reported as a failed generation.
      try { recoverRenderCachePublication(storage) } catch { /* Next explicit writer retries cleanup; LLM cache reads fail closed meanwhile. */ }
    },
  }
}
