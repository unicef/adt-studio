import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { BookWriterOwner } from "@adt/types"

export class BookBusyError extends Error {
  readonly code = "BOOK_BUSY"
  constructor(message = "This book has an active writer. Wait for it to finish or cancel it, then retry.") {
    super(`BOOK_BUSY: ${message}`)
    this.name = "BookBusyError"
  }
}

type Lease = { token: string; references: number; release: () => void }
const context = new AsyncLocalStorage<ReadonlyMap<string, Lease>>()
// Resolving a path must not create a book: admission for a deleted or
// mistyped label is refused upstream, and new books reserve their directory
// explicitly through withNewBookWriter.
const canonical = (dir: string) => fs.realpathSync(dir)
const lockName = ".book-writer.json"

export function ownsBookWriter(bookDir: string): boolean {
  let dir: string
  try { dir = canonical(bookDir) } catch { return false } // A missing book owns nothing.
  const lease = context.getStore()?.get(dir)
  return !!lease && lease.references > 0
}

function deadOwner(lock: string): boolean {
  const owner = BookWriterOwner.safeParse(JSON.parse(fs.readFileSync(lock, "utf8")))
  if (!owner.success || owner.data.host !== os.hostname()) return false
  try { process.kill(owner.data.pid, 0); return false } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"
  }
}

function acquire(dir: string): Lease {
  const lock = path.join(dir, lockName)
  const token = randomUUID()
  if (fs.existsSync(`${lock}.recovery`)) throw new BookBusyError()
  const create = () => {
    const fd = fs.openSync(lock, "wx", 0o600)
    try {
      fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, host: os.hostname() }))
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
  }
  try { create() } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
    // Reapers serialize too: never unlink a replacement lease another process
    // acquired after recovering the dead owner. Unknown/remote owners fail closed.
    const recovery = `${lock}.recovery`
    let fd: number | undefined
    try {
      fd = fs.openSync(recovery, "wx", 0o600)
      if (!deadOwner(lock)) throw new BookBusyError()
      // Keep SQLite journal/WAL files: SQLite recovers those itself. The
      // `<label>.db.lock` directory is different: node-sqlite3-wasm's own mutex,
      // created by a process's statements and removed on unlock, so a same-host
      // owner proven dead (ESRCH) cannot still hold it. Left in place it makes
      // every later statement fail with "database is locked" until someone
      // deletes it by hand (the common desktop force-quit case).
      const databaseLock = path.join(dir, `${path.basename(dir)}.db.lock`)
      if (fs.existsSync(databaseLock)) {
        fs.rmSync(databaseLock, { recursive: true, force: true })
        console.warn(`[book-writer] ${path.basename(dir)}: removed stale ${path.basename(databaseLock)} left by dead pid`)
      }
      fs.unlinkSync(lock)
      create()
    } catch (recoveryError) {
      if (recoveryError instanceof BookBusyError) throw recoveryError
      throw new BookBusyError("Book writer ownership could not be recovered. Check for another running ADT process before retrying.")
    } finally {
      if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(recovery) }
    }
  }
  const lease: Lease = {
    token, references: 0,
    release() {
      lease.references--
      if (lease.references !== 0) return
      if (!fs.existsSync(lock)) return // Explicit whole-book deletion.
      const owner = BookWriterOwner.parse(JSON.parse(fs.readFileSync(lock, "utf8")))
      if (owner.token !== token) throw new BookBusyError("Book writer ownership changed during the operation.")
      fs.unlinkSync(lock)
    },
  }
  return lease
}

/** One admission boundary for API, tasks, stage runners and CLI. Nested work
 * retains ownership until its promise settles, even after the HTTP response.
 * There is no age-based stealing of a live writer's lease. */
export function withBookWriter<T>(bookDir: string, operation: () => T): T {
  const dir = canonical(bookDir)
  const inherited = context.getStore()
  const existing = inherited?.get(dir)
  const lease = existing && existing.references > 0 ? existing : acquire(dir)
  lease.references++
  const scope = new Map(inherited)
  scope.set(dir, lease)
  return context.run(scope, () => {
    let result: T
    try { result = operation() } catch (err) { lease.release(); throw err }
    if (result instanceof Promise) return result.finally(() => lease.release()) as T
    lease.release()
    return result
  })
}

export function assertBookWriter(bookDir: string): void {
  if (!ownsBookWriter(bookDir)) throw new BookBusyError()
}

/** Reserve a new destination atomically, then use the same writer protocol as
 * extraction. If another process reaches the reservation first, never copy
 * source/archive bytes over its work. Callers must choose their own label. */
export function withNewBookWriter<T>(bookDir: string, operation: () => T): T {
  fs.mkdirSync(path.dirname(bookDir), { recursive: true })
  fs.mkdirSync(bookDir)
  return withBookWriter(bookDir, () => {
    if (fs.readdirSync(bookDir).some((entry) => entry !== lockName)) throw new BookBusyError()
    return operation()
  })
}
