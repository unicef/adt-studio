import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, openBookDb, withBookWriter } from "@adt/storage"
import { bookStateKey, createBookStateMemo } from "./book-state-memo.js"

let booksDir: string
beforeEach(() => { booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-state-memo-")) })
afterEach(() => { fs.rmSync(booksDir, { recursive: true, force: true }) })

it("reuses a derived result until the saved book changes, including writes that add no version", () => {
  const label = "memo-book", bookDir = path.join(booksDir, label)
  const storage = createBookStorage(label, booksDir)
  let computed = 0
  const memo = createBookStateMemo<number>()
  const read = () => memo(bookDir, bookStateKey(storage, bookDir), "all", () => ++computed)
  try {
    storage.putNodeData("metadata", "book", { title: "First" })
    expect(read()).toBe(1)
    expect(read()).toBe(1) // polls with nothing saved reuse the result
    expect(computed).toBe(1)

    storage.putNodeData("metadata", "book", { title: "Second" }) // a supported save: new version
    expect(read()).toBe(2)
    expect(read()).toBe(2)
  } finally { storage.close() }

  // A rewrite of an existing version (no new version, same fingerprint) still
  // changes the database file, so the derived result is recomputed.
  withBookWriter(bookDir, () => {
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    try { db.run("UPDATE node_data SET data=? WHERE node='metadata' AND item_id='book' AND version=1", [JSON.stringify({ title: "Edited" })]) }
    finally { db.close() }
  })
  const reopened = createBookStorage(label, booksDir)
  try {
    expect(memo(bookDir, bookStateKey(reopened, bookDir), "all", () => ++computed)).toBe(3)
  } finally { reopened.close() }
})

it("bounds retained results", () => {
  const memo = createBookStateMemo<number>(2)
  let computed = 0
  for (const key of ["a", "b", "c"]) memo(key, "generation", "all", () => ++computed)
  expect(memo("c", "generation", "all", () => ++computed)).toBe(3)
  expect(memo("a", "generation", "all", () => ++computed)).toBe(4) // evicted, recomputed
})


it("retains content-derived proofs across known telemetry writes, but never across an unexplained rewrite", () => {
  const label = "telemetry", bookDir = path.join(booksDir, label)
  let storage = createBookStorage(label, booksDir)
  let computed = 0
  const memo = createBookStateMemo<number>()
  const read = () => memo(bookDir, bookStateKey(storage, bookDir), "all", () => ++computed)
  try {
    storage.putNodeData("metadata", "book", { title: "Original" })
    expect(read()).toBe(1)
    for (let i = 0; i < 20; i++) {
      storage.markStepStarted("web-rendering")
      storage.updateStepMessage("web-rendering", `${i}/20`)
      storage.appendLlmLog({ requestId: `request-${i}`, timestamp: new Date().toISOString(), taskType: "web-rendering", promptName: "fixture", modelId: "fixture", cacheHit: true, success: true, errorCount: 0, attempt: 1, durationMs: 0, messages: [] })
      storage.markStepCompleted("web-rendering")
      expect(read()).toBe(1)
    }
    storage.close()
    storage = createBookStorage(label, booksDir)
    expect(read()).toBe(1)
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    try { db.run("UPDATE node_data SET data=? WHERE node='metadata'", [JSON.stringify({ title: "Raw rewrite" })]) }
    finally { db.close() }
    // A supported telemetry write after an external change must not hide it.
    storage.updateStepMessage("web-rendering", "After raw rewrite")
    expect(read()).toBe(2)
    expect(read()).toBe(2)
    storage.putNodeData("metadata", "book", { title: "New version" })
    expect(read()).toBe(3)
    storage.setCurrentNodeVersion("metadata", "book", 1)
    expect(read()).toBe(4)
  } finally { storage.close() }
})

it("does not classify a telemetry write with a content-mutating trigger as telemetry only", () => {
  const label = "trigger", bookDir = path.join(booksDir, label)
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putNodeData("metadata", "book", { title: "Original" })
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    try { db.exec(`CREATE TRIGGER unexpected_telemetry AFTER INSERT ON step_runs BEGIN UPDATE node_data SET data='{"title":"Changed"}' WHERE node='metadata'; END`) }
    finally { db.close() }
    const before = bookStateKey(storage, bookDir)
    storage.markStepStarted("web-rendering")
    expect(bookStateKey(storage, bookDir)).not.toBe(before)
    expect(storage.getLatestNodeData("metadata", "book")?.data).toEqual({ title: "Changed" })
  } finally { storage.close() }
})


it("keeps a 40-book working set despite repeated edits, and bounds per-book variants", () => {
  const memo = createBookStateMemo<number>()
  let computed = 0
  for (let i = 0; i < 40; i++) memo(`book-${i}`, "original", "all", () => ++computed)
  for (let i = 0; i < 100; i++) memo("book-0", `generation-${i}`, "all", () => ++computed)
  const afterEdits = computed
  for (let i = 1; i < 40; i++) expect(memo(`book-${i}`, "original", "all", () => ++computed)).toBe(i + 1)
  expect(computed).toBe(afterEdits)
  for (let i = 0; i < 5; i++) memo("book-0", "latest", `window-${i}`, () => ++computed)
  const afterVariants = computed
  memo("book-0", "latest", "window-0", () => ++computed)
  expect(computed).toBe(afterVariants + 1)
})
