import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { SectioningTransition, SectioningLifecycle, type SectioningMode } from "@adt/types"
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
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temp, "wx", 0o600)
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temp, file)
    syncDirectory(path.dirname(file))
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

export function readSectioningLifecycle(bookDir: string): SectioningLifecycle | null {
  const file = path.join(bookDir, SECTIONING_LIFECYCLE)
  if (!fs.existsSync(file)) return null
  return SectioningLifecycle.parse(JSON.parse(fs.readFileSync(file, "utf8")))
}

export function writeSectioningLifecycle(bookDir: string, mode: SectioningMode, sectioningReady: boolean): void {
  atomicBookFile(path.join(bookDir, SECTIONING_LIFECYCLE), JSON.stringify({ version: 1, mode, sectioningReady }))
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
    const transition = SectioningTransition.parse(JSON.parse(fs.readFileSync(journal, "utf8")))
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
