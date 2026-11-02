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
const runOf = (rows: ReturnType<ReturnType<typeof createBookStorage>["getStepRuns"]>, step: string) => rows.find((row) => row.step === step)

describe("step warnings in step_runs", () => {
  it("AC-25: step warnings are persisted typed, returned for done steps and cleared on restart", () => {
    const storage = createBookStorage("book", root)
    try {
      storage.markStepStarted("image-segmentation")
      storage.markStepCompleted("image-segmentation", "Completed — 1 page(s) kept…", [unchanged])
      expect(runOf(storage.getStepRuns(), "image-segmentation")).toMatchObject({ status: "done", warnings: [unchanged] })

      // Starting, skipping or failing the step again clears them, and so does a clean completion.
      storage.markStepStarted("image-segmentation")
      expect(runOf(storage.getStepRuns(), "image-segmentation")?.warnings).toBeNull()
      for (const end of [
        () => storage.markStepSkipped("image-segmentation"),
        () => storage.recordStepError("image-segmentation", "boom"),
        () => storage.markStepCompleted("image-segmentation"),
      ]) {
        storage.markStepCompleted("image-segmentation", "note", [unchanged])
        end()
        expect(runOf(storage.getStepRuns(), "image-segmentation")?.warnings).toBeNull()
      }
    } finally {
      storage.close()
    }
  })

  it("drops a stored value that is not a valid warning list", () => {
    const storage = createBookStorage("book", root)
    storage.markStepCompleted("glossary")
    storage.close()
    const raw = new sqlite.Database(path.join(root, "book", "book.db"))
    raw.run("UPDATE step_runs SET warnings = ? WHERE step = 'glossary'", ['[{"kind":"from-a-newer-app"}]'])
    raw.close()
    const reopened = createBookStorage("book", root)
    try {
      expect(runOf(reopened.getStepRuns(), "glossary")?.warnings).toBeNull()
    } finally {
      reopened.close()
    }
  })

  it("AC-27: a book without the warnings column opens, reads and gains it without a version bump", () => {
    createBookStorage("book", root).close()
    const dbPath = path.join(root, "book", "book.db")
    // A book last written by an app that predates the column.
    const raw = new sqlite.Database(dbPath)
    raw.exec("ALTER TABLE step_runs DROP COLUMN warnings")
    raw.run("INSERT INTO step_runs (step, status, completed_at, message) VALUES ('glossary', 'done', '2026-10-29', '13 terms')")
    raw.close()

    const storage = createBookStorage("book", root)
    try {
      expect(runOf(storage.getStepRuns(), "glossary")).toMatchObject({ status: "done", message: "13 terms", warnings: null })
      storage.markStepCompleted("image-cropping", "note", [unchanged])
      expect(runOf(storage.getStepRuns(), "image-cropping")?.warnings).toEqual([unchanged])
    } finally {
      storage.close()
    }

    const check = new sqlite.Database(dbPath)
    try {
      expect(check.all("SELECT version FROM schema_version WHERE id = 1")).toEqual([{ version: SCHEMA_VERSION }])
      // An older app names only the columns it knows; its writes still succeed.
      check.run(
        `INSERT INTO step_runs (step, status, completed_at, message) VALUES ('toc-generation', 'done', '2026-10-29', NULL)
         ON CONFLICT (step) DO UPDATE SET status='done', completed_at=excluded.completed_at, message=excluded.message`,
      )
      expect(check.all("SELECT step FROM step_runs WHERE step = 'toc-generation'")).toHaveLength(1)
    } finally {
      check.close()
    }
  })
})
