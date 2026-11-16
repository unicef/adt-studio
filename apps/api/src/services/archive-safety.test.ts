import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"

import {
  ARCHIVE_SAFETY_LIMITS,
  ArchiveSafetyError,
  IN_MEMORY_EXPANDED_BYTES,
  extractArchiveToDisk,
  formatArchiveByteLimit,
  inspectArchiveEntries,
  readArchiveEntries,
} from "./archive-safety.js"

const tmpDirs: string[] = []
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("archive safety limits", () => {
  it("accepts the size of real book backups (633 MiB, 5,456 entries were refused before)", () => {
    expect(ARCHIVE_SAFETY_LIMITS.compressedBytes).toBe(1024 * 1024 * 1024)
    // One entry is inflated whole, so it keeps the old in-memory bound.
    expect(ARCHIVE_SAFETY_LIMITS.entryBytes).toBe(1024 * 1024 * 1024)
    expect(ARCHIVE_SAFETY_LIMITS.entries).toBeGreaterThanOrEqual(100_000)
    // Archives still expanded in memory keep a 1 GiB bound.
    expect(IN_MEMORY_EXPANDED_BYTES).toBe(1024 * 1024 * 1024)
  })

  it("formats binary limits for actionable API errors", () => {
    expect(formatArchiveByteLimit(512 * 1024 * 1024)).toBe("512 MiB")
    expect(formatArchiveByteLimit(1024 * 1024 * 1024)).toBe("1 GiB")
  })
})

describe("inspectArchiveEntries", () => {
  it("lists names and sizes without inflating", () => {
    const zip = Buffer.from(zipSync({ "a.db": new Uint8Array(3), "images/b.png": new Uint8Array(5) }))
    expect(inspectArchiveEntries(zip)).toEqual([
      { name: "a.db", size: 3 },
      { name: "images/b.png", size: 5 },
    ])
  })

  it("rejects unsafe paths", () => {
    const zip = Buffer.from(zipSync({ "../evil.txt": new Uint8Array(1) }))
    expect(() => inspectArchiveEntries(zip)).toThrow(ArchiveSafetyError)
  })

  it("rejects a file that is not a zip", () => {
    expect(() => inspectArchiveEntries(Buffer.from("not a zip"))).toThrow("Invalid ZIP file")
  })
})

describe("readArchiveEntries", () => {
  it("inflates only the requested entries", () => {
    const zip = Buffer.from(zipSync({ "a.db": new Uint8Array([1]), "images/b.png": new Uint8Array([2]) }))
    expect(Object.keys(readArchiveEntries(zip, ["a.db"]))).toEqual(["a.db"])
  })
})

describe("extractArchiveToDisk", () => {
  it("writes every mapped entry, across batches, and skips unmapped ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-safety-"))
    tmpDirs.push(dir)
    // Three 30 MiB files force at least two 64 MiB batches.
    const big = (fill: number) => new Uint8Array(30 * 1024 * 1024).fill(fill)
    const zip = Buffer.from(zipSync({
      "book.db": new Uint8Array([9]),
      "audio/one.mp3": big(1),
      "audio/two.mp3": big(2),
      "audio/three.mp3": big(3),
      "skip/me.txt": new Uint8Array([0]),
    }, { level: 1 }))

    extractArchiveToDisk(zip, (name) => (name.startsWith("skip/") ? null : path.join(dir, name)))

    expect(fs.readFileSync(path.join(dir, "book.db"))).toEqual(Buffer.from([9]))
    for (const [name, fill] of [["one", 1], ["two", 2], ["three", 3]] as const) {
      const data = fs.readFileSync(path.join(dir, "audio", `${name}.mp3`))
      expect(data.byteLength).toBe(30 * 1024 * 1024)
      expect(data[data.byteLength - 1]).toBe(fill)
    }
    expect(fs.existsSync(path.join(dir, "skip"))).toBe(false)
  })
})
