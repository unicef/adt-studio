import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { PackagePublication } from "@adt/types"
import { assertBookWriter, atomicBookFile, createBookStorage, ExtractionAdmissionError, syncDirectory } from "@adt/storage"


export const PACKAGE_JOURNAL = ".package-publication.json"

/** Readers must not serve a partially switched artifact after a process crash. */
export function assertPackageReadable(bookDir: string): void {
  if (fs.existsSync(path.join(bookDir, PACKAGE_JOURNAL))) throw new ExtractionAdmissionError("BOOK_BUSY")
}

/** Recovery retains both generations. A journal is never a license to delete
 * an anonymous SQLite mutex or guess whether another process is alive. */
function evidenceCommitted(bookDir: string, record: PackagePublication): boolean {
  if (!record.evidence) return false
  const label = path.basename(bookDir)
  if (!fs.existsSync(path.join(bookDir, `${label}.db`))) throw new Error("Missing package evidence database")
  const storage = createBookStorage(label, path.dirname(bookDir))
  try {
    const row = storage.getAllNodeVersions("accessibility-assessment", "book").find((row) => row.version === record.evidence!.version)
    return row !== undefined && (row.data as { artifactHash?: string } | null)?.artifactHash === record.evidence.artifactHash
  } finally { storage.close() }
}

export function recoverPackagePublication(bookDir: string): boolean {
  assertBookWriter(bookDir)
  const journal = path.join(bookDir, PACKAGE_JOURNAL)
  if (!fs.existsSync(journal)) return false
  const record = PackagePublication.parse(JSON.parse(fs.readFileSync(journal, "utf8")))
  const attempt = path.join(bookDir, `.package-attempt-${record.attemptId}`)
  for (const directory of [attempt, path.join(bookDir, "adt"), path.join(attempt, "previous")]) {
    try { if (!fs.lstatSync(directory).isDirectory()) throw new ExtractionAdmissionError("BOOK_BUSY") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  const previous = path.join(attempt, "previous"), active = path.join(bookDir, "adt")
  const committed = evidenceCommitted(bookDir, record)
  if (!committed && fs.existsSync(previous)) {
    if (fs.existsSync(active)) fs.renameSync(active, path.join(attempt, `uncommitted-${randomUUID()}`))
    fs.renameSync(previous, active)
  } else if (!committed && record.hadPrevious === false && !fs.existsSync(path.join(attempt, "adt")) && fs.existsSync(active)) {
    fs.renameSync(active, path.join(attempt, `uncommitted-${randomUUID()}`))
  }
  // Old journals without a predecessor retain their historical conservative
  // behavior. New journals never expose uncommitted first-build evidence.
  fs.unlinkSync(journal)
  syncDirectory(bookDir)
  return committed
}

export function newPackageAttempt(bookDir: string): string {
  recoverPackagePublication(bookDir)
  const attempt = path.join(bookDir, `.package-attempt-${randomUUID()}`)
  fs.mkdirSync(attempt)
  return attempt
}

/** Synchronous publication under the common writer, with recoverable rename
 * intent flushed before activation and optional SQLite commit before visibility. */
export function publishPackageAttempt(bookDir: string, attempt: string, commit: () => void = () => {}, evidence?: PackagePublication["evidence"]): void {
  assertBookWriter(bookDir)
  const attemptId = path.basename(attempt).replace(/^\.package-attempt-/, "")
  const record = PackagePublication.parse({ version: 1, attemptId, hadPrevious: fs.existsSync(path.join(bookDir, "adt")), evidence })
  if (path.resolve(attempt) !== path.join(path.resolve(bookDir), `.package-attempt-${record.attemptId}`)) throw new Error("Invalid package attempt")
  const active = path.join(bookDir, "adt"), previous = path.join(attempt, "previous"), generated = path.join(attempt, "adt")
  if (!fs.lstatSync(generated).isDirectory()) throw new Error("Invalid package output")
  try { if (!fs.lstatSync(active).isDirectory()) throw new Error("Invalid active package") }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  atomicBookFile(path.join(bookDir, PACKAGE_JOURNAL), JSON.stringify(record))
  try {
    if (fs.existsSync(active)) fs.renameSync(active, previous)
    fs.renameSync(generated, active)
    commit()
  } catch (error) {
    // A callback can fail after SQLite COMMIT. Only its immutable evidence
    // receipt determines whether restoring the predecessor is still safe.
    if (!evidenceCommitted(bookDir, record)) {
      recoverPackagePublication(bookDir)
      throw error
    }
  }
  // Cleanup is outside the commit boundary. A leftover journal blocks readers
  // until the next writer recovers; it never turns a committed result into a
  // failed generation or restores a package unrelated to its assessment.
  try {
    fs.unlinkSync(path.join(bookDir, PACKAGE_JOURNAL))
    syncDirectory(bookDir)
  } catch (error) {
    if (!record.evidence && fs.existsSync(path.join(bookDir, PACKAGE_JOURNAL))) {
      // Filesystem-only callers have no SQLite receipt proving commit after a
      // restart. Preserve their failure/rollback contract until intent clears.
      recoverPackagePublication(bookDir)
      throw error
    }
    // Evidence-backed cleanup is retried by the next explicit writer.
  }
  // Attempt/predecessor directories remain book-local history and crash evidence.
}

export function packageFilesHash(directory: string, ignoredRootFiles: readonly string[] = []): string {
  const hash = createHash("sha256")
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("Invalid package directory")
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (dir === directory && (name === ".build-inventory" || ignoredRootFiles.includes(name))) continue
      const file = path.join(dir, name), stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error("Invalid package asset")
      hash.update(path.relative(directory, file))
      if (stat.isDirectory()) walk(file)
      else if (stat.isFile()) hash.update(createHash("sha256").update(fs.readFileSync(file)).digest())
      else throw new Error("Invalid package asset")
    }
  }
  walk(directory)
  return hash.digest("hex")
}
export function writePackageInventory(directory: string): void {
  fs.writeFileSync(path.join(directory, ".build-inventory"), packageFilesHash(directory))
}
export function packageInventoryValid(directory: string): boolean {
  try { return fs.readFileSync(path.join(directory, ".build-inventory"), "utf8") === packageFilesHash(directory) }
  catch { return false }
}
