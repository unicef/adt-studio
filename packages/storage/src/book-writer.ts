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

/** Kernel evidence only: no timestamp/age estimate and no new lock protocol.
 * Unknown procfs/container layouts retain the conservative busy fallback. */
function linuxProcess(pid: number): BookWriterOwner["linuxProcess"] {
  if (process.platform !== "linux") return undefined
  try {
    // A custom proc mount may expose another namespace's numeric PIDs.
    if (fs.readlinkSync("/proc/self") !== String(process.pid)) return undefined
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8")
    // comm (field 2) can contain spaces and parentheses. starttime is field 22.
    const end = stat.lastIndexOf(") ")
    if (end < 0 || !stat.startsWith(`${pid} (`)) return undefined
    const startTicks = stat.slice(end + 2).trim().split(/\s+/)[19]
    const bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
    const pidNamespace = fs.readlinkSync(`/proc/${pid}/ns/pid`)
    const parsed = BookWriterOwner.shape.linuxProcess.unwrap().safeParse({ bootId, pidNamespace, startTicks })
    if (!parsed.success) return undefined

    // Docker's daemon-owned bind mounts name the container, independently of
    // its configurable hostname. They survive a restart; a sibling container
    // has a different ID even if it shares the book volume and hostname.
    // Require all three corroborating records. Custom/unknown layouts cannot
    // authorize recovery across PID namespaces. No container state is created.
    let dockerContainerId: string | undefined
    try {
      const mounts = fs.readFileSync(`/proc/${pid}/mountinfo`, "utf8").split("\n")
      const ids = ["hostname", "hosts", "resolv.conf"].map((name) => {
        const entries = mounts.map((line) => line.split(" ")).filter((fields) => fields[4] === `/etc/${name}`)
        if (entries.length !== 1) return undefined
        const match = entries[0][3].match(/\/containers\/([a-f0-9]{64})\/(hostname|hosts|resolv\.conf)$/)
        return match?.[2] === name ? match[1] : undefined
      })
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8")
      const capabilities = ["CapBnd", "CapPrm", "CapEff"].map((field) =>
        status.match(new RegExp(`^${field}:\\s+([a-f0-9]+)$`, "m"))?.[1])
      const uidMap = fs.readFileSync(`/proc/${pid}/uid_map`, "utf8").trim().split(/\s+/)
      const seccomp = status.match(/^Seccomp:\s+(\d+)$/m)?.[1]
      // Privileged/nested namespace setups cannot use the standard Docker
      // lifecycle proof. CAP_SYS_ADMIN is bit 21. Restrict the proof to the
      // shipped rootful/default-seccomp deployment; a custom seccomp filter
      // cannot be identified from procfs and is not certified by this check.
      const standardIsolation = capabilities.every((value) => value && (BigInt(`0x${value}`) & (1n << 21n)) === 0n) &&
        uidMap.join(" ") === "0 0 4294967295" && seccomp === "2"
      if (standardIsolation && ids[0] && ids.every((id) => id === ids[0])) dockerContainerId = ids[0]
    } catch { /* Same-namespace identity remains usable without Docker evidence. */ }
    return { ...parsed.data, ...(dockerContainerId ? { dockerContainerId } : {}) }
  } catch { return undefined }
}

function deadOwner(lock: string): boolean {
  const owner = BookWriterOwner.safeParse(JSON.parse(fs.readFileSync(lock, "utf8")))
  if (!owner.success || owner.data.host !== os.hostname()) return false
  const recorded = owner.data.linuxProcess
  if (!recorded && process.platform === "linux") {
    // Old leases have no PID namespace. In Docker, a missing numeric PID in
    // this container says nothing about a sibling with the same custom host.
    // Keep the usual default-hostname compatibility only when the daemon's
    // container identity corroborates it. Recognized but unprovable Docker
    // layouts must not fall through to native ESRCH recovery.
    const here = linuxProcess(process.pid)
    const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8")
    const docker = fs.existsSync("/.dockerenv") || /\/containers\/[a-f0-9]{64}\/(?:hostname|hosts|resolv\.conf) /.test(mounts)
    if (docker && (!here?.dockerContainerId || !/^[a-f0-9]{12,64}$/.test(owner.data.host) ||
      !here.dockerContainerId.startsWith(owner.data.host))) return false
  }
  if (recorded) {
    const here = linuxProcess(process.pid)
    if (!here) return false
    if (recorded.bootId !== here.bootId || recorded.pidNamespace !== here.pidNamespace) {
      // A standard Docker container cannot retain its old init/PID namespace
      // across a restart. Do not extend that proof to sibling containers or
      // arbitrary OCI/custom/nested-namespace layouts.
      return !!recorded.dockerContainerId && recorded.dockerContainerId === here.dockerContainerId
    }
    if (recorded.dockerContainerId !== here.dockerContainerId) return false
  }
  try { process.kill(owner.data.pid, 0) } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"
  }
  if (!recorded) return false // A live legacy PID supplies no incarnation proof.
  const current = linuxProcess(owner.data.pid)
  return !!current && current.bootId === recorded.bootId &&
    current.pidNamespace === recorded.pidNamespace &&
    current.dockerContainerId === recorded.dockerContainerId &&
    current.startTicks !== recorded.startTicks
}

function acquire(dir: string): Lease {
  const lock = path.join(dir, lockName)
  const token = randomUUID()
  if (fs.existsSync(`${lock}.recovery`)) throw new BookBusyError()
  const create = () => {
    const fd = fs.openSync(lock, "wx", 0o600)
    try {
      fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, host: os.hostname(), linuxProcess: linuxProcess(process.pid) }))
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
      // owner proven dead (ESRCH or verified incarnation change) cannot hold it. Left in place it makes
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
