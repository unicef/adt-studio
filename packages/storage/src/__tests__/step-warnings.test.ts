import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SCHEMA_VERSION, type StepWarning } from "@adt/types"
import { createBookStorage } from "../book-storage.js"

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-step-warnings-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const unchanged: StepWarning = { kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] }
const skipped: StepWarning = { kind: "pages-skipped", count: 2 }
type Storage = ReturnType<typeof createBookStorage>
const runOf = (storage: Storage, step: string) => storage.getStepRuns().find((row) => row.step === step)
const dbPath = () => path.join(root, "book", "book.db")

/**
 * An app that predates `step_runs.warnings`: the statements are copied verbatim
 * from develop's `markStepStarted`, `markStepCompleted`, `markStepSkipped` and
 * `recordStepError` (before SPEC-0021). The completion time is passed in so it
 * never collides with this app's stamp.
 */
function olderApp() {
  const db = new sqlite.Database(dbPath())
  const at = "2026-11-20T00:00:00.000Z"
  return {
    markStepStarted(step: string) {
      db.run(
        `INSERT INTO step_runs (step, status, started_at) VALUES (?, 'running', ?)
         ON CONFLICT (step) DO UPDATE SET status='running', started_at=excluded.started_at, completed_at=NULL, error=NULL, message=NULL`,
        [step, at]
      )
    },
    markStepCompleted(step: string, message?: string) {
      if (message !== undefined) {
        db.run(
          `INSERT INTO step_runs (step, status, completed_at, message) VALUES (?, 'done', ?, ?)
           ON CONFLICT (step) DO UPDATE SET status='done', completed_at=excluded.completed_at, message=excluded.message`,
          [step, at, message]
        )
        return
      }
      db.run(
        `INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'done', ?)
         ON CONFLICT (step) DO UPDATE SET status='done', completed_at=excluded.completed_at`,
        [step, at]
      )
    },
    markStepSkipped(step: string) {
      db.run(
        `INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'skipped', ?)
         ON CONFLICT (step) DO UPDATE SET status='skipped', completed_at=excluded.completed_at`,
        [step, at]
      )
    },
    recordStepError(step: string, error: string) {
      db.run(
        `INSERT INTO step_runs (step, status, error) VALUES (?, 'error', ?)
         ON CONFLICT (step) DO UPDATE SET status='error', error=excluded.error`,
        [step, error]
      )
    },
    close: () => db.close(),
  }
}
type OlderApp = ReturnType<typeof olderApp>

/** Write with this app, then with the older app, then reopen with this app. */
function roundTrip(thisApp: (storage: Storage) => void, older: (app: OlderApp) => void): Storage {
  const storage = createBookStorage("book", root)
  thisApp(storage)
  storage.close()
  const app = olderApp()
  older(app)
  app.close()
  return createBookStorage("book", root)
}

describe("step warnings in step_runs (SPEC-0021 §Step warnings)", () => {
  it("AC-25: step warnings are persisted typed, returned for done steps and cleared on restart", () => {
    const storage = createBookStorage("book", root)
    try {
      storage.markStepStarted("image-segmentation")
      storage.markStepCompleted("image-segmentation", "Completed with 1 page(s) kept…", [unchanged])
      expect(runOf(storage, "image-segmentation")).toMatchObject({
        status: "done", warnings: [unchanged], warningSource: "recorded",
      })

      // Starting, skipping or failing the step again clears them; a running, skipped or failed step returns none.
      storage.markStepStarted("image-segmentation")
      expect(runOf(storage, "image-segmentation")).toMatchObject({ warnings: null, warningSource: null })
      for (const end of [
        () => storage.markStepSkipped("image-segmentation"),
        () => storage.recordStepError("image-segmentation", "boom"),
      ]) {
        storage.markStepCompleted("image-segmentation", "note", [unchanged])
        end()
        expect(runOf(storage, "image-segmentation")).toMatchObject({ warnings: null, warningSource: null })
      }
    } finally {
      storage.close()
    }
  })

  it("AC-25: a clean completion is recorded with an empty envelope, no warnings and no message", () => {
    const storage = createBookStorage("book", root)
    try {
      storage.markStepStarted("glossary")
      storage.updateStepMessage("glossary", "12/12")
      storage.markStepCompleted("glossary", "old note", [skipped])
      storage.markStepCompleted("glossary")
      expect(runOf(storage, "glossary")).toMatchObject({ status: "done", message: null, warnings: null, warningSource: "recorded" })
    } finally {
      storage.close()
    }
    const raw = new sqlite.Database(dbPath())
    try {
      const [row] = raw.all("SELECT completed_at, warnings FROM step_runs WHERE step = 'glossary'") as Array<{ completed_at: string; warnings: string }>
      expect(JSON.parse(row.warnings)).toEqual({ completedAt: row.completed_at, items: [] })
    } finally {
      raw.close()
    }
  })

  it("AC-25: the derived source-assessment warning is never persisted", () => {
    const storage = createBookStorage("book", root)
    try {
      storage.markStepCompleted("extract", "note", [{ kind: "source-assessment", warning: 2, critical: 0, incompletePages: 0 }, skipped])
      expect(runOf(storage, "extract")?.warnings).toEqual([skipped])
    } finally {
      storage.close()
    }
  })

  it("AC-27(a): a book without the column opens and gains it with SCHEMA_VERSION unchanged; its done rows read as legacy", () => {
    createBookStorage("book", root).close()
    const raw = new sqlite.Database(dbPath())
    raw.exec("ALTER TABLE step_runs DROP COLUMN warnings")
    raw.run("INSERT INTO step_runs (step, status, completed_at, message) VALUES ('glossary', 'done', '2026-10-29', '13 terms')")
    raw.run("INSERT INTO step_runs (step, status, completed_at, message) VALUES ('image-filtering', 'done', '2026-10-29', 'Completed — 3 page(s) skipped')")
    raw.close()

    const storage = createBookStorage("book", root)
    try {
      expect(runOf(storage, "glossary")).toMatchObject({ status: "done", message: "13 terms", warnings: null, warningSource: "legacy" })
      expect(runOf(storage, "image-filtering")).toMatchObject({
        warnings: [{ kind: "pages-skipped", count: 3 }], warningSource: "legacy",
      })
    } finally {
      storage.close()
    }
    const check = new sqlite.Database(dbPath())
    try {
      expect(check.all("SELECT version FROM schema_version WHERE id = 1")).toEqual([{ version: SCHEMA_VERSION }])
      expect((check.all("PRAGMA table_info(step_runs)") as Array<{ name: string }>).map((c) => c.name)).toContain("warnings")
    } finally {
      check.close()
    }
  })

  it("AC-27(b): an older start then a clean older complete never revive this app's warnings", () => {
    const storage = roundTrip(
      (s) => s.markStepCompleted("image-cropping", "note", [unchanged]),
      (older) => { older.markStepStarted("image-cropping"); older.markStepCompleted("image-cropping") },
    )
    try {
      expect(runOf(storage, "image-cropping")).toMatchObject({ status: "done", warnings: null, warningSource: "legacy" })
    } finally {
      storage.close()
    }
  })

  it("AC-27(b): a new skip recorded by an older app adapts to pages-skipped, and the stale envelope stays dead", () => {
    const storage = roundTrip(
      (s) => s.markStepCompleted("image-cropping", "note", [unchanged]),
      (older) => { older.markStepStarted("image-cropping"); older.markStepCompleted("image-cropping", "Completed — 3 page(s) skipped") },
    )
    try {
      expect(runOf(storage, "image-cropping")).toMatchObject({
        warnings: [{ kind: "pages-skipped", count: 3 }], warningSource: "legacy",
      })
    } finally {
      storage.close()
    }
  })

  it("AC-27(b): only the exact legacy skip literal adapts", () => {
    for (const message of ["Completed — 0 page(s) skipped", "Note: Completed — 3 page(s) skipped", "13 headings"]) {
      fs.rmSync(path.join(root, "book"), { recursive: true, force: true })
      const storage = roundTrip(() => {}, (older) => older.markStepCompleted("glossary", message))
      try {
        expect(runOf(storage, "glossary")).toMatchObject({ warnings: null, warningSource: "legacy" })
      } finally {
        storage.close()
      }
    }
  })

  it("AC-27(b): after this app records a skip, an older complete without a message revives nothing", () => {
    const storage = roundTrip(
      (s) => s.markStepCompleted("image-filtering", "Completed with 2 page(s) skipped.", [skipped]),
      (older) => older.markStepCompleted("image-filtering"),
    )
    try {
      expect(runOf(storage, "image-filtering")).toMatchObject({ warnings: null, warningSource: "legacy" })
    } finally {
      storage.close()
    }
  })

  it("AC-27(c): an older error or skip leaves the step failed or skipped with no warnings", () => {
    for (const older of [
      (app: OlderApp) => app.recordStepError("image-cropping", "boom"),
      (app: OlderApp) => app.markStepSkipped("image-cropping"),
    ]) {
      fs.rmSync(path.join(root, "book"), { recursive: true, force: true })
      const storage = roundTrip((s) => s.markStepCompleted("image-cropping", "note", [unchanged]), older)
      try {
        const run = runOf(storage, "image-cropping")
        expect(run?.status).not.toBe("done")
        expect(run).toMatchObject({ warnings: null, warningSource: null })
      } finally {
        storage.close()
      }
    }
  })

  it("AC-27(d): unknown and malformed elements stay visible as unrecognized next to the known ones", () => {
    const storage = createBookStorage("book", root)
    storage.markStepCompleted("glossary")
    storage.markStepCompleted("toc-generation")
    storage.close()
    const raw = new sqlite.Database(dbPath())
    const [{ completed_at }] = raw.all("SELECT completed_at FROM step_runs WHERE step = 'glossary'") as Array<{ completed_at: string }>
    raw.run("UPDATE step_runs SET warnings = ? WHERE step = 'glossary'", [
      JSON.stringify({ completedAt: completed_at, items: [skipped, { kind: "from-a-newer-app" }, { kind: "pages-skipped", count: -1 }] }),
    ])
    raw.run("UPDATE step_runs SET warnings = 'not json' WHERE step = 'toc-generation'")
    raw.close()

    const reopened = createBookStorage("book", root)
    try {
      expect(runOf(reopened, "glossary")).toMatchObject({
        warnings: [skipped, { kind: "unrecognized", count: 2 }], warningSource: "recorded",
      })
      expect(runOf(reopened, "toc-generation")?.warnings).toEqual([{ kind: "unrecognized", count: 1 }])
    } finally {
      reopened.close()
    }
  })
})
