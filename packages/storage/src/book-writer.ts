import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { BookWriterOwner } from "@adt/types"

export class BookBusyError extends Error {
  readonly code = "BOOK_BUSY"
  constructor(message = "This book has an active writer. Wait for it to finish or cancel it, then retry.") {
    super(message)
    this.name = "BookBusyError"
  }
}

type Lease = { token: string; references: number; release: () => void }
const context = new AsyncLocalStorage<ReadonlyMap<string, Lease>>()
const canonical = (dir: string) => fs.realpathSync(dir)
const lockName = ".book-writer.json"

export function ownsBookWriter(bookDir: string): boolean {
  const lease = context.getStore()?.get(canonical(bookDir))
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
      // Journal-aware readers refuse DB access during this transition. Once
      // its owning process is confirmed dead, only its WASM mutex is stale.
      // Keep SQLite rollback/WAL files: SQLite, not ADT, recovers transactions.
      if (fs.existsSync(path.join(dir, ".sectioning-transition.json"))) {
        fs.rmSync(path.join(dir, `${path.basename(dir)}.db.lock`), { recursive: true, force: true })
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
      // Explicit book deletion removes its lease along with the directory.
      if (!fs.existsSync(dir)) return
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
