import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { PackagePublication } from "@adt/types"
import { assertBookWriter, atomicBookFile, ExtractionAdmissionError, syncDirectory } from "@adt/storage"

export const PACKAGE_JOURNAL = ".package-publication.json"

/** Readers must not serve a partially switched artifact after a process crash. */
export function assertPackageReadable(bookDir: string): void {
  if (fs.existsSync(path.join(bookDir, PACKAGE_JOURNAL))) throw new ExtractionAdmissionError("BOOK_BUSY")
}

/** Recovery retains both generations. A journal is never a license to delete
 * an anonymous SQLite mutex or guess whether another process is alive. */
export function recoverPackagePublication(bookDir: string): void {
  assertBookWriter(bookDir)
  const journal = path.join(bookDir, PACKAGE_JOURNAL)
  if (!fs.existsSync(journal)) return
  const record = PackagePublication.parse(JSON.parse(fs.readFileSync(journal, "utf8")))
  const attempt = path.join(bookDir, `.package-attempt-${record.attemptId}`)
  for (const directory of [attempt, path.join(bookDir, "adt"), path.join(attempt, "previous")]) {
    try { if (!fs.lstatSync(directory).isDirectory()) throw new ExtractionAdmissionError("BOOK_BUSY") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  const previous = path.join(attempt, "previous"), active = path.join(bookDir, "adt")
  if (fs.existsSync(previous)) {
    if (fs.existsSync(active)) fs.renameSync(active, path.join(attempt, `uncommitted-${randomUUID()}`))
    fs.renameSync(previous, active)
  }
  // With no predecessor a fully renamed attempt is safe to inspect. Missing
  // generation evidence still prevents resume from treating it as current.
  fs.unlinkSync(journal)
  syncDirectory(bookDir)
}

export function newPackageAttempt(bookDir: string): string {
  recoverPackagePublication(bookDir)
  const attempt = path.join(bookDir, `.package-attempt-${randomUUID()}`)
  fs.mkdirSync(attempt)
  return attempt
}

/** Synchronous publication under the common writer, with recoverable rename
 * intent flushed before activation and optional SQLite commit before visibility. */
export function publishPackageAttempt(bookDir: string, attempt: string, commit: () => void = () => {}): void {
  assertBookWriter(bookDir)
  const attemptId = path.basename(attempt).replace(/^\.package-attempt-/, "")
  const record = PackagePublication.parse({ version: 1, attemptId })
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
    fs.unlinkSync(path.join(bookDir, PACKAGE_JOURNAL))
    syncDirectory(bookDir)
  } catch (error) {
    recoverPackagePublication(bookDir)
    throw error
  }
  // The predecessor is an immutable book-local history asset.
  if (!fs.existsSync(previous)) fs.rmSync(attempt, { recursive: true })
}

export function packageFilesHash(directory: string): string {
  const hash = createHash("sha256")
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("Invalid package directory")
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (dir === directory && name === ".build-inventory") continue
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
