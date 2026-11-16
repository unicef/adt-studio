import fs from "node:fs"
import path from "node:path"
import os from "node:os"

import { describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

// Simulate a crash part-way through a projection replay.
vi.mock("../seed/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../seed/index.js")>()
  return {
    ...actual,
    seedImportedImages: (...args: Parameters<typeof actual.seedImportedImages>) => {
      if ((globalThis as { __failImages?: boolean }).__failImages) throw new Error("simulated crash in seedImportedImages")
      return actual.seedImportedImages(...args)
    },
  }
})

import { ADT_IMPORT_PROJECTION_VERSION, ensureImportedAdtProjectProjection } from "../projection.js"
import { makeBundleWithEasyReadAndSignLanguage, seedFromArchive, temporaryRoots } from "./fixtures.js"

function imported(extra: Record<string, unknown> = {}) {
  const archive = makeBundleWithEasyReadAndSignLanguage()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-resume-"))
  temporaryRoots.push(dir)
  const session = seedFromArchive(archive, dir)
  const bookDir = path.join(dir, session.label)
  fs.mkdirSync(path.join(bookDir, ".adt-imports", "rev"), { recursive: true })
  fs.writeFileSync(path.join(bookDir, ".adt-imports", "rev", "source.zip"), archive)
  const currentPath = path.join(bookDir, ".adt-import-current.json")
  fs.writeFileSync(currentPath, JSON.stringify({
    version: 1,
    revisionId: "rev",
    projectionVersion: ADT_IMPORT_PROJECTION_VERSION - 1,
    ...extra,
  }))
  return { dir, label: session.label, readCurrent: () => JSON.parse(fs.readFileSync(currentPath, "utf8")) }
}

// F19: an interrupted upgrade is finished on the next start.
describe("projection replay", () => {
  it("resumes a replay a crash interrupted instead of skipping it", () => {
    const { dir, label, readCurrent } = imported()
    ;(globalThis as { __failImages?: boolean }).__failImages = true
    try {
      expect(() => ensureImportedAdtProjectProjection(label, dir)).toThrow(/simulated crash/)
    } finally {
      ;(globalThis as { __failImages?: boolean }).__failImages = false
    }
    expect(readCurrent()).toMatchObject({ projectionInProgress: true, projectionVersion: ADT_IMPORT_PROJECTION_VERSION - 1 })

    expect(ensureImportedAdtProjectProjection(label, dir)).toBe(true)
    const current = readCurrent()
    expect(current.projectionVersion).toBe(ADT_IMPORT_PROJECTION_VERSION)
    expect(current.projectionInProgress).toBeUndefined()
    expect(current.projectionReplaySkippedFrom).toBeUndefined()
    expect(current.projectedVersions).toEqual(expect.objectContaining({ "web-rendering/pg001": expect.any(Number) }))
  })

  it("does not bring back a sign-language video the user deleted", () => {
    const probe = imported()
    const ids = (() => {
      const storage = createBookStorage(probe.label, probe.dir)
      try {
        return storage.getSignLanguageVideos().map((video) => video.videoId)
      } finally {
        storage.close()
      }
    })()
    expect(ids.length).toBeGreaterThan(1)

    const { dir, label } = imported({ signLanguageVideoIds: ids })
    const storage = createBookStorage(label, dir)
    try {
      storage.deleteSignLanguageVideo(ids[0])
    } finally {
      storage.close()
    }
    expect(ensureImportedAdtProjectProjection(label, dir)).toBe(true)
    const after = createBookStorage(label, dir)
    try {
      expect(after.getSignLanguageVideos().map((video) => video.videoId)).not.toContain(ids[0])
    } finally {
      after.close()
    }
  })
})
