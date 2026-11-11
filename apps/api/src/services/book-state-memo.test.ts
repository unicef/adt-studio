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
  const read = () => memo(bookStateKey(storage, bookDir), () => ++computed)
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
    expect(memo(bookStateKey(reopened, bookDir), () => ++computed)).toBe(3)
  } finally { reopened.close() }
})

it("bounds retained results", () => {
  const memo = createBookStateMemo<number>(2)
  let computed = 0
  for (const key of ["a", "b", "c"]) memo(key, () => ++computed)
  expect(memo("c", () => ++computed)).toBe(3)
  expect(memo("a", () => ++computed)).toBe(4) // evicted, recomputed
})
