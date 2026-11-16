import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { ADT_IMPORT_IN_PROGRESS_MARKER, removeAbandonedAdtImports } from "./marker.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

// F27: a crashed import must not leave a hidden folder forever.
describe("removeAbandonedAdtImports", () => {
  it("removes folders still marked as importing and keeps every real book", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-abandoned-"))
    roots.push(booksDir)
    fs.mkdirSync(path.join(booksDir, "raven"))
    fs.writeFileSync(path.join(booksDir, "raven", "raven.db"), "partial")
    fs.writeFileSync(path.join(booksDir, "raven", ADT_IMPORT_IN_PROGRESS_MARKER), "{}")
    fs.mkdirSync(path.join(booksDir, "lab-raven"))
    fs.writeFileSync(path.join(booksDir, "lab-raven", "lab-raven.db"), "real")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(removeAbandonedAdtImports(booksDir)).toEqual(["raven"])
    } finally {
      warn.mockRestore()
    }
    expect(fs.readdirSync(booksDir)).toEqual(["lab-raven"])
    expect(removeAbandonedAdtImports(path.join(booksDir, "missing"))).toEqual([])
  })
})
