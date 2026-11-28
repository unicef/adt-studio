import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { SectioningTransition, SectioningLifecycle, PIPELINE, type SectioningMode } from "@adt/types"
import { openBookDb } from "./db.js"
import { BookBusyError, withBookWriter } from "./book-writer.js"

export const SECTIONING_JOURNAL = ".sectioning-transition.json"
export const SECTIONING_LIFECYCLE = ".sectioning-lifecycle.json"
export const configHash = (text: string | null) => createHash("sha256").update(text === null ? "absent" : `present:${text}`).digest("hex")
export function readConfigText(bookDir: string): string | null {
  try { return fs.readFileSync(path.join(bookDir, "config.yaml"), "utf8") } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

function syncDirectory(dir: string): void {
  // Windows does not expose POSIX directory fsync through Node. File contents
  // are still flushed before replacement there; installer smoke is separate.
  if (process.platform === "win32") return
  const fd = fs.openSync(dir, "r")
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function removeJournal(journal: string): void {
  fs.unlinkSync(journal)
  syncDirectory(path.dirname(journal))
}

/** Same-directory replacement with durable contents; never truncate the live file. */
export function atomicBookFile(file: string, text: string): void {
  const previous = fs.lstatSync(file, { throwIfNoEntry: false })
  if (previous && (!previous.isFile() || previous.nlink !== 1)) throw new BookBusyError("The book file is not a regular private path. Existing data has been preserved.")
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temp, "wx", 0o600)
    try {
      fs.writeFileSync(fd, text)
      // Existing shared-volume permissions survive replacement; newly created
      // bookkeeping keeps the private default. chmod avoids the current umask.
      if (previous) fs.fchmodSync(fd, previous.mode & 0o777)
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
    fs.renameSync(temp, file)
    syncDirectory(path.dirname(file))
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

/** Preserve the exact invalid override before an explicit valid replacement.
 * Content addressing makes retries idempotent; unknown aliases never qualify. */
export function retainInvalidBookConfig(bookDir: string): void {
  const source = path.join(bookDir, "config.yaml"), stat = fs.lstatSync(source)
  if (!stat.isFile() || stat.nlink !== 1) throw new BookBusyError("The invalid configuration is not a regular private file.")
  const bytes = fs.readFileSync(source)
  const name = `.config-recovery-${createHash("sha256").update(bytes).digest("hex")}.yaml`
  const target = path.join(bookDir, name)
  if (fs.existsSync(target)) {
    if (!isConfigRecoveryEvidence(bookDir, name)) throw new BookBusyError("Configuration recovery evidence conflicts with the saved file.")
    return
  }
  const fd = fs.openSync(target, "wx", stat.mode & 0o777)
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  syncDirectory(bookDir)
}

export function isConfigRecoveryEvidence(bookDir: string, name: string): boolean {
  const digest = /^\.config-recovery-([a-f0-9]{64})\.yaml$/.exec(name)?.[1]
  if (!digest) return false
  try {
    const file = path.join(bookDir, name), stat = fs.lstatSync(file)
    return stat.isFile() && stat.nlink === 1 && createHash("sha256").update(fs.readFileSync(file)).digest("hex") === digest
  } catch { return false }
}

/** null means absent; undefined means unreadable optional bookkeeping.
 * Keep unreadable bytes/paths as evidence instead of replacing them on Save. */
function readLifecycleText(bookDir: string): string | null | undefined {
  try { return fs.readFileSync(path.join(bookDir, SECTIONING_LIFECYCLE), "utf8") }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") return null
    if (code) return undefined
    throw error
  }
}

function parseLifecycle(text: string | null | undefined): SectioningLifecycle | null {
  if (text == null) return null
  try {
    const parsed = SectioningLifecycle.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export function readSectioningLifecycle(bookDir: string): SectioningLifecycle | null {
  return parseLifecycle(readLifecycleText(bookDir))
}

export function writeSectioningLifecycle(bookDir: string, mode: SectioningMode, sectioningReady: boolean, storyboardPending?: boolean): void {
  const text = readLifecycleText(bookDir)
  if (text === undefined) return
  const previous = parseLifecycle(text)
  const pending = storyboardPending ?? (!sectioningReady || previous?.storyboardPending === true || previous?.sectioningReady === false)
  atomicBookFile(path.join(bookDir, SECTIONING_LIFECYCLE), JSON.stringify({ version: 1, mode, sectioningReady, storyboardPending: pending }))
}

/** Invalidation must revoke readiness before its associated DB mutation. A
 * failed mutation can conservatively leave work stale, never falsely current.
 * Do not invent provenance for historical books without a lifecycle record. */
export function invalidateSectioningLifecycle(bookDir: string, steps: readonly string[]): void {
  const sectioning = PIPELINE.find((stage) => stage.name === "sectioning")!
  if (!sectioning.steps.some((step) => steps.includes(step.name))) return
  const lifecycle = readSectioningLifecycle(bookDir)
  if (lifecycle?.sectioningReady) writeSectioningLifecycle(bookDir, lifecycle.mode, false)
}

function finishPublishedTransition(bookDir: string, transition: SectioningTransition): void {
  const label = path.basename(bookDir)
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  try {
    db.exec("BEGIN IMMEDIATE")
    try {
      for (const step of transition.affectedSteps) db.run("DELETE FROM step_runs WHERE step = ?", [step])
      db.exec("COMMIT")
    } catch (err) { db.exec("ROLLBACK"); throw err }
    writeSectioningLifecycle(bookDir, transition.newMode, false)
    removeJournal(path.join(bookDir, SECTIONING_JOURNAL))
  } finally { db.close() }
}

/** Must run before a reader or runner trusts config + successful step status. */
export function recoverSectioningTransition(bookDir: string): void {
  const journal = path.join(bookDir, SECTIONING_JOURNAL)
  if (!fs.existsSync(journal)) return
  withBookWriter(bookDir, () => {
    if (!fs.existsSync(journal)) return
    const invalidJournal = "The saved Sectioning transition is invalid. Its journal is retained for inspection before recovery."
    const text = fs.readFileSync(journal, "utf8")
    let data: unknown
    try { data = JSON.parse(text) }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      throw new BookBusyError(invalidJournal)
    }
    const parsed = SectioningTransition.safeParse(data)
    if (!parsed.success) throw new BookBusyError(invalidJournal)
    const transition = parsed.data
    const hash = configHash(readConfigText(bookDir))
    if (hash === transition.newHash) finishPublishedTransition(bookDir, transition)
    else if (hash === transition.oldHash) removeJournal(journal)
    else throw new BookBusyError("An unfinished Sectioning transition conflicts with config.yaml. Restore the pre-transition or proposed configuration before retrying recovery.")
  })
}

/** Caller resolves and validates both effective modes under the shared gate.
 * A post-publication failure deliberately leaves the journal for recovery. */
export function publishSectioningTransition(
  bookDir: string, newText: string, newMode: SectioningMode, affectedSteps: string[],
): void {
  withBookWriter(bookDir, () => {
    recoverSectioningTransition(bookDir)
    const db = openBookDb(path.join(bookDir, `${path.basename(bookDir)}.db`))
    try {
      const rows = db.all("SELECT step, status, started_at, completed_at, error, message FROM step_runs")
      const transition = SectioningTransition.parse({
        version: 1, oldHash: configHash(readConfigText(bookDir)), newHash: configHash(newText),
        newMode, affectedSteps,
        previousStepRuns: rows.filter((row) => affectedSteps.includes((row as { step: string }).step)),
      })
      const journal = path.join(bookDir, SECTIONING_JOURNAL)
      atomicBookFile(journal, JSON.stringify(transition))
      try { atomicBookFile(path.join(bookDir, "config.yaml"), newText) } catch (err) {
        // If rename succeeded but its caller failed ambiguously, recovery uses
        // the published hash. Never assume that a thrown write was unapplied.
        if (configHash(readConfigText(bookDir)) === transition.oldHash) removeJournal(journal)
        throw err
      }
      finishPublishedTransition(bookDir, transition)
    } finally { db.close() }
  })
}
