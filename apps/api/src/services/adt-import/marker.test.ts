import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { ADT_IMPORT_IN_PROGRESS_MARKER, removeAbandonedAdtImports } from "./marker.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

// F27: a crashed import must not leave a hidden folder forever, and an import
// another process is running must never be touched.
describe("removeAbandonedAdtImports", () => {
  const marker = (fields: Record<string, unknown>) => JSON.stringify({ version: 1, createdAt: new Date().toISOString(), ...fields })

  it("removes only imports whose process is gone, or that started over a day ago", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-abandoned-"))
    roots.push(booksDir)
    const make = (label: string, markerJson: string | null) => {
      fs.mkdirSync(path.join(booksDir, label))
      fs.writeFileSync(path.join(booksDir, label, `${label}.db`), "x")
      if (markerJson !== null) fs.writeFileSync(path.join(booksDir, label, ADT_IMPORT_IN_PROGRESS_MARKER), markerJson)
    }
    make("dead-owner", marker({ pid: 999_999, hostname: os.hostname() }))
    make("live-owner", marker({ pid: process.pid, hostname: os.hostname() }))
    make("other-host-recent", marker({ pid: 1, hostname: "another-container" }))
    make("no-owner-old", marker({ createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() }))
    make("unknown-marker", "{}")
    make("real-book", null)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(removeAbandonedAdtImports(booksDir).sort()).toEqual(["dead-owner", "no-owner-old"])
    } finally {
      warn.mockRestore()
    }
    expect(fs.readdirSync(booksDir).sort()).toEqual(["live-owner", "other-host-recent", "real-book", "unknown-marker"])
    expect(removeAbandonedAdtImports(path.join(booksDir, "missing"))).toEqual([])
  })
})
