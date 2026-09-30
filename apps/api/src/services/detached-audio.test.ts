import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { preserveDetachedRecordings } from "./detached-audio.js"

describe("preserveDetachedRecordings", () => {
  let bookDir: string

  beforeEach(() => {
    bookDir = fs.mkdtempSync(path.join(os.tmpdir(), "detached-audio-"))
    fs.mkdirSync(path.join(bookDir, "audio", "en"), { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(bookDir, { recursive: true, force: true })
  })

  it("keeps every original on partial failure and safely retries in a fresh directory", () => {
    const recordings = ["first.mp3", "second.mp3"].map((fileName) => ({ language: "en", fileName }))
    for (const { fileName } of recordings) {
      fs.writeFileSync(path.join(bookDir, "audio", "en", fileName), fileName)
    }
    // Even retries in the same millisecond cannot overwrite an earlier backup.
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-09-09T00:00:00.000Z")
    const originalCopy = fs.copyFileSync
    const copy = vi.spyOn(fs, "copyFileSync")
      .mockImplementationOnce(originalCopy)
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" })
      })
    expect(() => preserveDetachedRecordings(bookDir, recordings)).toThrow("Could not preserve uploaded recording second.mp3")
    copy.mockRestore()
    for (const { fileName } of recordings) {
      expect(fs.readFileSync(path.join(bookDir, "audio", "en", fileName), "utf8")).toBe(fileName)
    }
    const preserved = preserveDetachedRecordings(bookDir, recordings)
    expect(preserved).toHaveLength(2)
    expect(fs.readdirSync(path.join(bookDir, "audio", ".detached"))).toHaveLength(2)
    for (let i = 0; i < recordings.length; i++) {
      fs.writeFileSync(path.join(bookDir, "audio", "en", recordings[i].fileName), "regenerated")
      expect(fs.readFileSync(path.join(bookDir, preserved[i]), "utf8")).toBe(recordings[i].fileName)
    }
  })

  it("skips an already-missing source without creating a backup directory", () => {
    expect(preserveDetachedRecordings(bookDir, [{ language: "en", fileName: "missing.mp3" }])).toEqual([])
    expect(fs.existsSync(path.join(bookDir, "audio", ".detached"))).toBe(false)
  })

  it("does not mistake an unreadable source for an already-missing upload", () => {
    vi.spyOn(fs, "statSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" })
    })
    expect(() => preserveDetachedRecordings(bookDir, [{ language: "en", fileName: "unreadable.mp3" }]))
      .toThrow("Could not preserve uploaded recording")
  })

  it("backs up a file only once when multiple entries name it", () => {
    const recording = { language: "en", fileName: "shared.mp3" }
    fs.writeFileSync(path.join(bookDir, "audio", "en", recording.fileName), "original")
    const preserved = preserveDetachedRecordings(bookDir, [recording, recording])
    expect(preserved).toHaveLength(1)
    expect(fs.readFileSync(path.join(bookDir, preserved[0]), "utf8")).toBe("original")
  })
})
