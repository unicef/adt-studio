import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import {
  baseSourceHash,
  compileReaderRuntime,
  followGlobalReader,
  listGlobalLatest,
  readBookHistory,
  readGlobalHistory,
  ReaderSourceConflictError,
  readReaderSourceMode,
  resolveReaderOverlay,
  restoreBookSource,
  revertBookSource,
  saveBookSource,
  writeGlobalVersion,
} from "../reader-runtime/index.js"

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../apps/adt-runtime")
const label = "reader-book"
const DOCK = "features/dock/components/DockIconButton.tsx"

let root: string
let globalDir: string
let storage: Storage

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-runtime-"))
  globalDir = path.join(root, ".reader-source")
  storage = createBookStorage(label, root)
})

afterEach(() => {
  storage.close()
  fs.rmSync(root, { recursive: true, force: true })
})

function save(sourcePath: string, content: string, baseVersion: number | null = null) {
  return saveBookSource(storage, {
    path: sourcePath,
    content,
    baseVersion,
    baseHash: baseSourceHash(runtimeDir, sourcePath),
    globalFiles: listGlobalLatest(globalDir),
  })
}

describe("reader source layers", () => {
  it("AC-6: a book follows the global layer until customized; tombstones fall back to the base", () => {
    writeGlobalVersion(globalDir, "styles/extra.css", { content: "global", baseHash: null }, null)
    expect(resolveReaderOverlay(storage, globalDir)).toMatchObject({
      followsGlobal: true,
      files: [{ path: "styles/extra.css", layer: "global", content: "global" }],
    })

    const version = save(DOCK, "book")
    expect(resolveReaderOverlay(storage, globalDir).files.map((file) => [file.path, file.layer])).toEqual([
      [DOCK, "book"],
      ["styles/extra.css", "book"],
    ])

    revertBookSource(storage, DOCK, version)
    expect(resolveReaderOverlay(storage, globalDir).files.map((file) => file.path)).toEqual(["styles/extra.css"])
  })

  it("AC-14: every save appends a version", () => {
    const first = save(DOCK, "one")
    const second = save(DOCK, "two", first)
    expect(second).toBe(first + 1)
    expect(readBookHistory(storage, DOCK).map((entry) => entry.data.content)).toEqual(["one", "two"])
  })

  it("AC-15: a stale base version is rejected and nothing is written", () => {
    const first = save(DOCK, "one")
    save(DOCK, "two", first)
    expect(() => save(DOCK, "lost", first)).toThrow(ReaderSourceConflictError)
    expect(() => revertBookSource(storage, DOCK, first)).toThrow(ReaderSourceConflictError)
    expect(readBookHistory(storage, DOCK)).toHaveLength(2)
  })

  it("AC-16: revert writes a tombstone and an older version can be restored as a new one", () => {
    const first = save(DOCK, "one")
    const tombstone = revertBookSource(storage, DOCK, first)
    expect(readBookHistory(storage, DOCK).at(-1)?.data.deleted).toBe(true)

    const restored = restoreBookSource(storage, DOCK, first, tombstone)
    expect(restored).toBe(tombstone + 1)
    expect(readBookHistory(storage, DOCK).map((entry) => entry.data.content)).toEqual(["one", "", "one"])
  })

  it("AC-17: an override keeps the base hash it was made from", () => {
    save(DOCK, "one")
    expect(readBookHistory(storage, DOCK)[0]?.data.baseHash).toBe(baseSourceHash(runtimeDir, DOCK))
    expect(baseSourceHash(runtimeDir, "features/new/Thing.tsx")).toBeNull()
  })

  it("AC-20: customizing detaches the book, and following the global layer again keeps its rows", () => {
    writeGlobalVersion(globalDir, DOCK, { content: "global v1", baseHash: "h" }, null)
    save("styles/globals.css", "book css")
    expect(readReaderSourceMode(storage).followsGlobal).toBe(false)

    writeGlobalVersion(globalDir, DOCK, { content: "global v2", baseHash: "h" }, 1)
    const customized = resolveReaderOverlay(storage, globalDir).files.find((file) => file.path === DOCK)
    expect(customized?.content).toBe("global v1")

    followGlobalReader(storage)
    const following = resolveReaderOverlay(storage, globalDir)
    expect(following.files).toEqual([expect.objectContaining({ path: DOCK, layer: "global", content: "global v2" })])
    expect(readBookHistory(storage, "styles/globals.css")).toHaveLength(1)

    save(DOCK, "book again")
    expect(resolveReaderOverlay(storage, globalDir).files.map((file) => [file.path, file.content])).toEqual([[DOCK, "book again"]])
  })

  it("AC-21: a global reset is a tombstone that keeps the history", () => {
    const first = writeGlobalVersion(globalDir, DOCK, { content: "global", baseHash: null }, null)
    writeGlobalVersion(globalDir, DOCK, { content: "", baseHash: null, deleted: true }, first)
    expect(readGlobalHistory(globalDir, DOCK).map((entry) => entry.data.deleted ?? false)).toEqual([false, true])
    expect(() => writeGlobalVersion(globalDir, DOCK, { content: "x", baseHash: null }, first)).toThrow(ReaderSourceConflictError)
    expect(resolveReaderOverlay(storage, globalDir).files).toEqual([])
  })
})

describe("compileReaderRuntime", () => {
  const cacheDir = () => path.join(root, ".cache")
  const base = fs.readFileSync(path.join(runtimeDir, "src", DOCK), "utf8")

  it("AC-6 / AC-10: compiles an override into the bundle and reuses the cache", async () => {
    const files = [{ path: DOCK, content: `${base}\nconsole.info("reader-override-marker")\n` }]
    const first = await compileReaderRuntime({ runtimeDir, files, cacheDir: cacheDir() })
    expect(first).toMatchObject({ ok: true, cached: false })
    if (!first.ok) return
    const bundle = fs.readFileSync(path.join(first.dir, "base.bundle.local.js"), "utf8")
    expect(bundle).toContain("__adtSource")
    expect(bundle).toContain("reader-override-marker")

    const second = await compileReaderRuntime({ runtimeDir, files, cacheDir: cacheDir() })
    expect(second).toMatchObject({ ok: true, cached: true, hash: first.hash })
  }, 60_000)

  it("AC-7: rejects imports outside the runtime dependencies", async () => {
    const result = await compileReaderRuntime({
      runtimeDir,
      cacheDir: cacheDir(),
      files: [{ path: DOCK, content: `import "left-pad"\nimport "node:fs"\nimport "../../../../package.json"\n${base}` }],
    })
    expect(result.ok).toBe(false)
    const messages = result.errors.map((error) => error.message).join("\n")
    expect(messages).toContain(`"left-pad" is not allowed`)
    expect(messages).toContain(`"node:fs" is not allowed`)
    expect(messages).toContain("outside the reader source")
  }, 60_000)

  it("AC-8: reports syntax errors with src-relative path, line and column", async () => {
    const result = await compileReaderRuntime({
      runtimeDir,
      cacheDir: cacheDir(),
      files: [{ path: DOCK, content: `${base}\nexport const broken = (\n` }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatchObject({ path: DOCK })
    expect(result.errors[0]?.line).toBeGreaterThan(0)
  }, 60_000)
})
