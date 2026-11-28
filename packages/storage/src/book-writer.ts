import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { BookWriterOwner, BookWriterReservation } from "@adt/types"

export class BookBusyError extends Error {
  readonly code = "BOOK_BUSY"
  constructor(message = "This book may still be in use. Finish any active work and close other book apps, then retry. If it stays unavailable, go to Library, select this book, and choose Recover a copy. If recovery is also refused, restart your computer and try again.") {
    super(`BOOK_BUSY: ${message}`)
    this.name = "BookBusyError"
  }
}

type Lease = { token: string; references: number; writers: number; databases: Set<string>; release: () => void }
type WriterScope = { lease: Lease; active: boolean }
const context = new AsyncLocalStorage<ReadonlyMap<string, WriterScope>>()
// Database handles in this JS isolate may borrow the same process lease while
// an admitted writer awaits I/O. Borrowing does not install writer authority.
const localLeases = new Map<string, Lease>()
// Only failed, fully unwound admissions/releases from this module instance
// may be reclaimed while their PID is alive. Bind tokens to the canonical book;
// neither a copied token nor an active database handle supplies this authority.
const abandoned = new Map<string, Set<string>>()
const admitting = new Set<string>()
const copyingSources = new Set<string>()
function rememberAbandoned(dir: string, token: string): void {
  const tokens = abandoned.get(dir) ?? new Set<string>()
  tokens.add(token)
  abandoned.set(dir, tokens)
}

/** Rare sharing violations can outlive one syscall, especially on Windows.
 * The healthy path never waits; a persistent failure remains a typed refusal. */
function changeLease(operation: () => void): void {
  for (let attempt = 0; ; attempt++) {
    try { operation(); return } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
      if (attempt === 4) throw new BookBusyError("Book ownership files are temporarily unavailable. Retry after the filesystem operation finishes.")
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * 2 ** attempt)
    }
  }
}
// Resolving a path must not create a book: admission for a deleted or
// mistyped label is refused upstream, and new books reserve their directory
// explicitly through withNewBookWriter.
const canonical = (dir: string) => fs.realpathSync(dir)
const lockName = ".book-writer.json"

export function ownsBookWriter(bookDir: string): boolean {
  let dir: string
  try { dir = canonical(bookDir) } catch { return false } // A missing book owns nothing.
  const scope = context.getStore()?.get(dir)
  return !!scope?.active && scope.lease.writers > 0
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

function readOwner(lock: string): BookWriterOwner {
  const stat = fs.lstatSync(lock)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new BookBusyError("Book ownership evidence is not a regular private file.")
  return BookWriterOwner.parse(JSON.parse(fs.readFileSync(lock, "utf8")))
}

function provenDead(owner: BookWriterOwner): boolean {
  if (owner.host !== os.hostname()) return false
  const recorded = owner.linuxProcess
  if (!recorded && process.platform === "linux") {
    // Old leases have no PID namespace. In Docker, a missing numeric PID in
    // this container says nothing about a sibling with the same custom host.
    // Keep the usual default-hostname compatibility only when the daemon's
    // container identity corroborates it. Recognized but unprovable Docker
    // layouts must not fall through to native ESRCH recovery.
    const here = linuxProcess(process.pid)
    const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8")
    const docker = fs.existsSync("/.dockerenv") || /\/containers\/[a-f0-9]{64}\/(?:hostname|hosts|resolv\.conf) /.test(mounts)
    if (docker && (!here?.dockerContainerId || !/^[a-f0-9]{12,64}$/.test(owner.host) ||
      !here.dockerContainerId.startsWith(owner.host))) return false
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
  try { process.kill(owner.pid, 0) } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"
  }
  if (!recorded) return false // A live legacy PID supplies no incarnation proof.
  const current = linuxProcess(owner.pid)
  return !!current && current.bootId === recorded.bootId &&
    current.pidNamespace === recorded.pidNamespace &&
    current.dockerContainerId === recorded.dockerContainerId &&
    current.startTicks !== recorded.startTicks
}

function recoverableOwner(dir: string, owner: BookWriterOwner): boolean {
  return (!localLeases.has(dir) && owner.pid === process.pid && owner.host === os.hostname() &&
    abandoned.get(dir)?.has(owner.token) === true) || provenDead(owner)
}

/** Explicit copy recovery may proceed with unknown ownership, but never with
 * a known live owner. This grants no admission to, or mutation of, the source. */
export function assertNoKnownLiveBookOwner(bookDir: string): void {
  const dir = canonical(bookDir)
  if (localLeases.has(dir) || admitting.has(dir)) throw new BookBusyError()
  const live = (owner: BookWriterOwner): boolean => {
    if (owner.host !== os.hostname() || provenDead(owner)) return false
    if (owner.linuxProcess) {
      const here = linuxProcess(process.pid)
      if (!here || here.bootId !== owner.linuxProcess.bootId || here.pidNamespace !== owner.linuxProcess.pidNamespace ||
          here.dockerContainerId !== owner.linuxProcess.dockerContainerId) return false
    }
    try { process.kill(owner.pid, 0); return true }
    catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM" }
  }
  for (const name of fs.readdirSync(dir)) {
    if (name !== lockName && !name.startsWith(lockName + ".")) continue
    let owners: BookWriterOwner[] = []
    try {
      const file = path.join(dir, name)
      if (fs.lstatSync(file).isDirectory()) {
        // Even a reservation with unrelated extra entries can identify a live
        // process. Its structural invalidity must not waive the refusal.
        const recordFile = path.join(file, "owner.json")
        const stat = fs.lstatSync(recordFile)
        if (!stat.isFile() || stat.nlink !== 1 || fs.realpathSync(recordFile) !== recordFile) throw new BookBusyError()
        const record = JSON.parse(fs.readFileSync(recordFile, "utf8"))
        owners = [record.owner, record.previous].flatMap(value => {
          const parsed = BookWriterOwner.safeParse(value)
          return parsed.success ? [parsed.data] : []
        })
      } else owners = [readOwner(file)]
    } catch { /* Unverifiable evidence is copied and retained, never unlocked. */ }
    if (owners.some(live)) throw new BookBusyError()
  }
}

/** Avoid our own Library/read admissions changing a stranded source while it
 * is copied. Other processes remain subject to the copy's stability checks. */
export async function withBookRecoverySource<T>(bookDir: string, operation: () => Promise<T>): Promise<T> {
  const dir = canonical(bookDir)
  if (copyingSources.has(dir)) throw new BookBusyError()
  assertNoKnownLiveBookOwner(dir)
  copyingSources.add(dir)
  try { return await operation() }
  finally { copyingSources.delete(dir) }
}

function syncLeaseDirectory(dir: string): void {
  if (process.platform === "win32") return
  const fd = fs.openSync(dir, "r")
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function entryExists(file: string): boolean {
  try { fs.lstatSync(file); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
}

function readReservation(file: string): BookWriterReservation {
  const stat = fs.lstatSync(file)
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(file).join() !== "owner.json") throw new BookBusyError()
  const record = path.join(file, "owner.json")
  const recordStat = fs.lstatSync(record)
  if (!recordStat.isFile() || recordStat.isSymbolicLink() || recordStat.nlink !== 1) throw new BookBusyError()
  return BookWriterReservation.parse(JSON.parse(fs.readFileSync(record, "utf8")))
}

/** Recognize only complete, inert protocol artifacts, never arbitrary files
 * sharing a prefix, symlinks, SQLite mutexes or canonical active reservations. */
function artifactOwner(dir: string, name: string): BookWriterOwner | undefined {
  if (!name.startsWith(lockName + ".")) return undefined
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
  try {
    if (new RegExp(`^\\.book-writer\\.json\\.preparing-${uuid}$`).test(name)) return readOwner(path.join(dir, name))
    const orphan = name.match(new RegExp(`^\\.book-writer\\.json\\.recovery\\.(${uuid})$`))
    if (orphan) {
      const record = readReservation(path.join(dir, name))
      if (record.predecessorToken !== orphan[1] || record.previous || record.rootToken === record.owner.token) return undefined
      const root = path.join(dir, `${lockName}.recovery`)
      if (entryExists(root) && readReservation(root).rootToken === record.rootToken) return undefined
      return record.owner
    }
    const match = name.match(new RegExp(`^\\.book-writer\\.json\\.recovery(?:\\.(${uuid}))?\\.(preparing|completed)-(${uuid})$`))
    if (!match) return undefined
    const record = readReservation(path.join(dir, name))
    if (record.predecessorToken) {
      if (record.rootToken === record.owner.token || record.previous) return undefined
    } else if (record.rootToken !== record.owner.token) return undefined
    if (match[1] ? record.predecessorToken !== match[1] : !!record.predecessorToken) return undefined
    // A completed root may be retired by a later successor. A preparation
    // or completed successor always bears its own owner's token.
    if ((match[2] === "preparing" || match[1]) && record.owner.token !== match[3]) return undefined
    return record.owner
  } catch { return undefined }
}

export function isBookWriterArtifact(bookDir: string, name: string): boolean {
  if (artifactOwner(bookDir, name) !== undefined) return true
  // Death immediately after mkdir can leave an empty preparation. It holds
  // no book data and need not pollute backups or reject first extraction.
  // Preserve it on disk: no owner evidence permits deleting it automatically.
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
  if (!new RegExp(`^\\.book-writer\\.json\\.recovery(?:\\.${uuid})?\\.(?:preparing|completed)-${uuid}$`).test(name)) return false
  try {
    const file = path.join(bookDir, name)
    return fs.lstatSync(file).isDirectory() && fs.readdirSync(file).length === 0
  } catch { return false }
}

function cleanAbandonedArtifacts(dir: string): boolean {
  let complete = true
  for (const name of fs.readdirSync(dir)) {
    const owner = artifactOwner(dir, name)
    if (!owner || !recoverableOwner(dir, owner)) continue
    try { changeLease(() => fs.rmSync(path.join(dir, name), { recursive: true })) }
    catch { complete = false /* Inert artifacts do not block a read. */ }
  }
  return complete
}

/** The canonical reservation is never empty or partly written. rename of a
 * prepared nonempty directory cannot replace another nonempty reservation. */
function publishReservation(file: string, record: BookWriterReservation): void {
  const prepared = `${file}.preparing-${record.owner.token}`
  fs.mkdirSync(prepared, { mode: 0o700 })
  try {
    const fd = fs.openSync(path.join(prepared, "owner.json"), "wx", 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd) }
    finally { fs.closeSync(fd) }
    syncLeaseDirectory(prepared)
    if (entryExists(file)) throw new BookBusyError()
    changeLease(() => fs.renameSync(prepared, file))
    syncLeaseDirectory(path.dirname(file))
  } finally { if (entryExists(prepared)) changeLease(() => fs.rmSync(prepared, { recursive: true })) }
}

/** A dead reservation is extended, never unlinked by competing reapers. Its
 * token names one exclusive successor. After claiming a successor, revalidate
 * the root: a delayed contender cannot act on a completed/replaced chain.
 * Only the live leaf can change ownership. Completion atomically retires the
 * root FIRST, so death during cleanup cannot strand anonymous evidence. */
function reserveAdmission(dir: string, owner: BookWriterOwner, markIssued: () => void) {
  const recovery = path.join(dir, `${lockName}.recovery`)
  const lock = path.join(dir, lockName)
  let root: BookWriterReservation
  const chain: Array<{ file: string; record: BookWriterReservation }> = []
  if (!entryExists(recovery)) {
    const previous = entryExists(lock) ? readOwner(lock) : undefined
    if (previous && !recoverableOwner(dir, previous)) throw new BookBusyError()
    root = { format: "adt-book-admission-v1", rootToken: owner.token, owner, ...(previous ? { previous } : {}) }
    markIssued()
    publishReservation(recovery, root)
    chain.push({ file: recovery, record: root })
  } else {
    root = readReservation(recovery)
    if (root.rootToken !== root.owner.token || root.predecessorToken) throw new BookBusyError()
    let file = recovery, record = root
    const seen = new Set<string>()
    for (;;) {
      if (seen.has(record.owner.token) || !recoverableOwner(dir, record.owner)) throw new BookBusyError()
      seen.add(record.owner.token)
      chain.push({ file, record })
      file = `${recovery}.${record.owner.token}`
      const predecessorToken = record.owner.token
      if (entryExists(file)) {
        record = readReservation(file)
        if (record.rootToken !== root.rootToken || record.predecessorToken !== predecessorToken || record.previous) throw new BookBusyError()
      } else {
        record = { format: "adt-book-admission-v1", rootToken: root.rootToken, predecessorToken, owner }
        markIssued()
        publishReservation(file, record)
        chain.push({ file, record })
        try {
          if (readReservation(recovery).rootToken !== root.rootToken) throw new BookBusyError()
        } catch (error) { changeLease(() => fs.rmSync(file, { recursive: true })); throw error }
        break
      }
    }
  }
  return {
    previous: root.previous,
    ownerTokens: new Set(chain.map(item => item.record.owner.token)),
    release(completed: boolean) {
      if (readReservation(recovery).rootToken !== root.rootToken) throw new BookBusyError()
      if (!completed && chain.length > 1) {
        // Refusal must preserve the predecessor's recovery evidence. Retire
        // only our unused successor; no database or owner changes occurred.
        const own = chain.at(-1)!
        const retired = `${own.file}.completed-${owner.token}`
        changeLease(() => fs.renameSync(own.file, retired))
        syncLeaseDirectory(dir)
        changeLease(() => fs.rmSync(retired, { recursive: true }))
        return
      }
      const retired = `${recovery}.completed-${owner.token}`
      changeLease(() => fs.renameSync(recovery, retired))
      syncLeaseDirectory(dir)
      changeLease(() => fs.rmSync(retired, { recursive: true }))
      for (const item of chain.slice(1)) changeLease(() => fs.rmSync(item.file, { recursive: true }))
    },
  }
}

/** Replace complete lease bytes, including capability registration. A killed
 * process leaves either the prior valid lease or the next valid lease. */
function publishOwner(lock: string, owner: BookWriterOwner): void {
  const prepared = `${lock}.preparing-${randomUUID()}`
  const fd = fs.openSync(prepared, "wx", 0o600)
  let open = true
  try {
    const bytes = Buffer.from(JSON.stringify(owner))
    let offset = 0
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset)
      if (written <= 0) throw new BookBusyError("Database ownership evidence could not be saved.")
      offset += written
    }
    fs.fsyncSync(fd)
    fs.closeSync(fd); open = false
    changeLease(() => fs.renameSync(prepared, lock))
    syncLeaseDirectory(path.dirname(lock))
  } finally {
    if (open) fs.closeSync(fd)
    if (entryExists(prepared)) changeLease(() => fs.unlinkSync(prepared))
  }
}

function databaseMutexes(dir: string, databases: readonly string[] = []): string[] {
  return [...new Set([
    `${path.basename(dir)}.db.lock`,
    ...databases.map(file => `${file}.lock`),
    ...fs.readdirSync(dir).filter(file => file.endsWith(".db.lock")),
  ])].filter(file => entryExists(path.join(dir, file)))
}

function verifyLocalLease(dir: string, lease: Lease): void {
  try {
    const lock = path.join(dir, lockName)
    // This lease was already published under the reservation. A later reaper
    // must recheck this live owner under its own reservation and cannot revoke
    // it; only token/capability changes invalidate an existing local pin.
    const owner = readOwner(lock)
    if (owner.token !== lease.token || owner.pid !== process.pid ||
      [...lease.databases].some(file => !owner.coordinatedDatabases?.includes(file))) throw new BookBusyError()
  } catch {
    throw new BookBusyError("Book ownership changed while database connections were still open. Recovery evidence has been preserved.")
  }
}

function acquire(dir: string, databaseFile?: string): Lease {
  if (admitting.has(dir) || copyingSources.has(dir)) throw new BookBusyError()
  admitting.add(dir)
  const token = randomUUID()
  let issued = false
  try { return acquireLease(dir, databaseFile, token, () => { issued = true }) }
  catch (error) {
    // Ordinary contention wrote no evidence and must not accumulate tokens.
    if (issued) rememberAbandoned(dir, token)
    if (error instanceof BookBusyError) throw error
    throw new BookBusyError("Book ownership could not be recovered. Recovery evidence has been preserved.")
  } finally { admitting.delete(dir) }
}

function acquireLease(dir: string, databaseFile: string | undefined, token: string, markIssued: () => void): Lease {
  const lock = path.join(dir, lockName)
  const owner: BookWriterOwner = { token, pid: process.pid, host: os.hostname(), linuxProcess: linuxProcess(process.pid), coordinatedDatabases: [] }
  const removeOwn = () => {
    if (readOwner(lock).token !== token) throw new BookBusyError("Book ownership changed during admission.")
    changeLease(() => fs.unlinkSync(lock))
  }
  let reservation: ReturnType<typeof reserveAdmission> | undefined
  let changed = false
  let published = false
  try {
    reservation = reserveAdmission(dir, owner, markIssued)
    const previous = entryExists(lock) ? readOwner(lock) : undefined
    if (previous) {
      if (!recoverableOwner(dir, previous) || (previous.token !== reservation.previous?.token &&
        !reservation.ownerTokens.has(previous.token))) throw new BookBusyError()
    } else if (reservation.previous) throw new BookBusyError()
    const registered = new Set(previous?.coordinatedDatabases ?? [])
    const mutexes = databaseMutexes(dir, [...registered, ...(databaseFile ? [databaseFile] : [])])
    // Validate all candidates before changing any. No age-based lock deletion.
    for (const name of mutexes) {
      const stat = fs.lstatSync(path.join(dir, name))
      if (!registered.has(name.slice(0, -5)) || !stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(path.join(dir, name)).length) {
        throw new BookBusyError("An interrupted book write left a database lock with unverified ownership. Recovery evidence has been preserved.")
      }
    }
    for (const name of mutexes) { changed = true; fs.rmdirSync(path.join(dir, name)) }
    // SQLite recovers its own WAL/journals. Keep the prior valid lease until
    // its complete successor is ready, with no empty owner-file crash window.
    changed = true
    // All existing mutexes were validated above. A reader's first database
    // capability can travel in the initial complete owner publication, before
    // SQLite opens, rather than rewriting the same owner a second time.
    if (databaseFile) owner.coordinatedDatabases = [databaseFile]
    publishOwner(lock, owner)
    published = true
  } catch (error) {
    if (error instanceof BookBusyError) throw error
    throw new BookBusyError("Book ownership could not be recovered. Recovery evidence has been preserved.")
  } finally {
    if (reservation && (published || !changed)) reservation.release(published)
  }
  const lease: Lease = {
    token, references: 0, writers: 0, databases: new Set(owner.coordinatedDatabases),
    release() {
      lease.references--
      if (lease.references !== 0) return
      localLeases.delete(dir)
      // Explicit book deletion removes its lease along with the directory.
      if (!fs.existsSync(dir)) return
      try { removeOwn() }
      catch (error) {
        rememberAbandoned(dir, token)
        if (error instanceof BookBusyError) throw error
        throw new BookBusyError("Book ownership could not be released. Retry after the filesystem operation finishes.")
      }
    },
  }
  if (cleanAbandonedArtifacts(dir)) abandoned.delete(dir)
  localLeases.set(dir, lease)
  return lease
}

/** Retain the existing admission protocol for the complete SQLite connection
 * lifetime. All production constructors must call this before opening SQLite.
 * A borrower never becomes an admitted writer through AsyncLocalStorage. */
export function retainBookDatabase(dbPath: string): () => void {
  const dir = canonical(path.dirname(dbPath))
  const filename = path.basename(dbPath)
  const file = path.join(dir, filename)
  if (entryExists(file)) {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fs.realpathSync(file) !== file) {
      throw new BookBusyError("A database path alias cannot establish mutex ownership.")
    }
  }
  const lease = localLeases.get(dir) ?? acquire(dir, filename)
  lease.references++
  try {
    verifyLocalLease(dir, lease)
    if (!lease.databases.has(filename)) {
      if (entryExists(`${file}.lock`)) throw new BookBusyError("Database mutex ownership could not be verified. Recovery evidence has been preserved.")
      const lock = path.join(dir, lockName)
      const owner = readOwner(lock)
      if (owner.token !== lease.token) throw new BookBusyError("Book ownership changed before opening the database.")
      publishOwner(lock, { ...owner, coordinatedDatabases: [...lease.databases, filename] })
      lease.databases.add(filename)
    }
  } catch (error) { lease.release(); throw error }
  let released = false
  return () => { if (!released) { released = true; lease.release() } }
}

/** One writer admission boundary for API, tasks, runners and CLI. Database pins
 * can outlive an operation; only that operation's active context grants writes.
 * Nested background work has its own scope and remains admitted until settled. */
export function withBookWriter<T>(bookDir: string, operation: () => T): T {
  const dir = canonical(bookDir)
  const inherited = context.getStore()
  const existing = inherited?.get(dir)
  const local = localLeases.get(dir)
  const lease = existing?.active ? existing.lease : local && local.writers === 0 ? local : acquire(dir)
  try { verifyLocalLease(dir, lease) }
  catch (error) {
    if (lease.references === 0) { lease.references++; try { lease.release() } catch { /* Retain uncertain owner evidence. */ } }
    throw error
  }
  lease.references++
  lease.writers++
  const operationScope: WriterScope = { lease, active: true }
  const scope = new Map(inherited)
  scope.set(dir, operationScope)
  const release = () => { operationScope.active = false; lease.writers--; lease.release() }
  return context.run(scope, () => {
    let result: T
    try { result = operation() } catch (err) { release(); throw err }
    if (result instanceof Promise) return result.finally(release) as T
    release()
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
