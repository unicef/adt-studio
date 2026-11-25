import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage, withBookWriter, type Storage } from "@adt/storage"
import {
  baseSourceHash,
  compileReaderRuntime,
  followGlobalReader,
  globalReaderSourceDir,
  listBaseSourceFiles,
  listBookLatest,
  listGlobalLatest,
  readBaseSource,
  readBookHistory,
  readBookLatest,
  readerRuntimeDir,
  readGlobalHistory,
  readGlobalLatest,
  readReaderSourceMode,
  resolveReaderOverlay,
  restoreBookSource,
  revertBookSource,
  saveBookSource,
  writeGlobalVersion,
  type LatestReaderSource,
  type ReaderSourceVersion,
} from "@adt/pipeline"
import { ReaderSourcePath } from "@adt/types"
import type {
  ReaderSourceCompileResult,
  ReaderSourceFile,
  ReaderSourceHistoryEntry,
  ReaderSourceLayer,
  ReaderSourceTree,
  ReaderSourceTreeEntry,
} from "@adt/types"
import { requireExistingBook } from "../utils/book-exists.js"

function checked(sourcePath: string): string {
  const parsed = ReaderSourcePath.safeParse(sourcePath)
  if (!parsed.success) throw new HTTPException(400, { message: `Invalid reader source path: ${sourcePath}` })
  return parsed.data
}

function toHistory(versions: ReaderSourceVersion[]): ReaderSourceHistoryEntry[] {
  return versions.map(({ version, data }) => ({ version, content: data.deleted ? null : data.content, deleted: Boolean(data.deleted) }))
}

export function createReaderSourceService(booksDir: string, webAssetsDir: string) {
  const globalDir = globalReaderSourceDir(booksDir)

  function runtimeDir(): string {
    const dir = readerRuntimeDir(webAssetsDir)
    if (!dir) throw new HTTPException(503, { message: "The reader source is not available in this installation." })
    return dir
  }

  function withBook<T>(label: string, operation: (storage: Storage, bookDir: string) => T): T {
    const bookDir = requireExistingBook(label, booksDir)
    const storage = createBookStorage(label, booksDir)
    try {
      return operation(storage, bookDir)
    } finally {
      storage.close()
    }
  }

  function describe(layer: ReaderSourceLayer, entries: LatestReaderSource[]): ReaderSourceTree["files"] {
    const runtime = runtimeDir()
    const overrides = new Map(entries.filter((entry) => !entry.data.deleted).map((entry) => [entry.path, entry]))
    const paths = new Set([...listBaseSourceFiles(runtime), ...overrides.keys()])
    return [...paths].sort().map((sourcePath): ReaderSourceTreeEntry => {
      const override = overrides.get(sourcePath)
      if (!override) return { path: sourcePath, layer: "base", version: null, outdated: false }
      const outdated = override.data.baseHash !== null && override.data.baseHash !== baseSourceHash(runtime, sourcePath)
      return { path: sourcePath, layer, version: override.version, outdated }
    })
  }

  function effectiveFile(layer: ReaderSourceLayer, sourcePath: string, latest: ReaderSourceVersion | null): ReaderSourceFile {
    if (latest && !latest.data.deleted) {
      const outdated = latest.data.baseHash !== null && latest.data.baseHash !== baseSourceHash(runtimeDir(), sourcePath)
      return { path: sourcePath, layer, version: latest.version, outdated, content: latest.data.content, baseHash: latest.data.baseHash }
    }
    const content = readBaseSource(runtimeDir(), sourcePath)
    if (content === null) throw new HTTPException(404, { message: `${sourcePath} does not exist in the reader source` })
    return { path: sourcePath, layer: "base", version: null, outdated: false, content, baseHash: baseSourceHash(runtimeDir(), sourcePath) }
  }

  return {
    tree(label: string): ReaderSourceTree {
      return withBook(label, (storage) => {
        const { followsGlobal } = readReaderSourceMode(storage)
        return {
          followsGlobal,
          files: followsGlobal ? describe("global", listGlobalLatest(globalDir)) : describe("book", listBookLatest(storage)),
        }
      })
    },

    file(label: string, sourcePath: string): ReaderSourceFile {
      checked(sourcePath)
      return withBook(label, (storage) =>
        readReaderSourceMode(storage).followsGlobal
          ? effectiveFile("global", sourcePath, readGlobalLatest(globalDir, sourcePath))
          : effectiveFile("book", sourcePath, readBookLatest(storage, sourcePath)),
      )
    },

    base(sourcePath: string): { base: string | null; global: string | null } {
      checked(sourcePath)
      const global = readGlobalLatest(globalDir, sourcePath)
      return { base: readBaseSource(runtimeDir(), sourcePath), global: global && !global.data.deleted ? global.data.content : null }
    },

    history(label: string, sourcePath: string): ReaderSourceHistoryEntry[] {
      checked(sourcePath)
      return withBook(label, (storage) => toHistory(readBookHistory(storage, sourcePath)))
    },

    save(label: string, sourcePath: string, content: string, baseVersion: number | null): number {
      checked(sourcePath)
      const baseHash = baseSourceHash(runtimeDir(), sourcePath)
      return withBook(label, (storage, bookDir) =>
        withBookWriter(bookDir, () =>
          saveBookSource(storage, { path: sourcePath, content, baseVersion, baseHash, globalFiles: listGlobalLatest(globalDir) }),
        ),
      )
    },

    revert(label: string, sourcePath: string, baseVersion: number | null): number {
      checked(sourcePath)
      return withBook(label, (storage, bookDir) => withBookWriter(bookDir, () => revertBookSource(storage, sourcePath, baseVersion)))
    },

    restore(label: string, sourcePath: string, version: number, baseVersion: number | null): number {
      checked(sourcePath)
      return withBook(label, (storage, bookDir) => {
        const restored = withBookWriter(bookDir, () => restoreBookSource(storage, sourcePath, version, baseVersion))
        if (restored === null) throw new HTTPException(404, { message: `Version ${version} of ${sourcePath} not found` })
        return restored
      })
    },

    followGlobal(label: string): number {
      return withBook(label, (storage, bookDir) => withBookWriter(bookDir, () => followGlobalReader(storage)))
    },

    search(label: string, query: string, limit: number): Array<{ path: string; line: number; text: string }> {
      const overrides = withBook(label, (storage) => new Map(resolveReaderOverlay(storage, globalDir).files.map((file) => [file.path, file.content])))
      const runtime = runtimeDir()
      const paths = [...new Set([...listBaseSourceFiles(runtime), ...overrides.keys()])].sort()
      const needle = query.toLowerCase()
      const matches: Array<{ path: string; line: number; text: string }> = []
      for (const sourcePath of paths) {
        const content = overrides.get(sourcePath) ?? readBaseSource(runtime, sourcePath) ?? ""
        const lines = content.split("\n")
        for (let index = 0; index < lines.length && matches.length < limit; index++) {
          if (lines[index].toLowerCase().includes(needle)) matches.push({ path: sourcePath, line: index + 1, text: lines[index].trim().slice(0, 200) })
        }
        if (matches.length >= limit) break
      }
      return matches
    },

    async compile(label: string, drafts: Record<string, string> = {}): Promise<ReaderSourceCompileResult> {
      Object.keys(drafts).forEach(checked)
      const { files, cacheDir } = withBook(label, (storage, bookDir) => ({
        files: resolveReaderOverlay(storage, globalDir).files,
        cacheDir: path.join(bookDir, ".cache"),
      }))
      const merged = new Map(files.map((file) => [file.path, file.content]))
      for (const [sourcePath, content] of Object.entries(drafts)) merged.set(sourcePath, content)
      const result = await compileReaderRuntime({
        runtimeDir: runtimeDir(),
        files: [...merged].map(([sourcePath, content]) => ({ path: sourcePath, content })),
        cacheDir,
      })
      return { ok: result.ok, hash: result.hash, errors: result.errors }
    },

    globalTree(): ReaderSourceTree {
      return { followsGlobal: true, files: describe("global", listGlobalLatest(globalDir)) }
    },

    globalFile(sourcePath: string): ReaderSourceFile {
      checked(sourcePath)
      return effectiveFile("global", sourcePath, readGlobalLatest(globalDir, sourcePath))
    },

    globalHistory(sourcePath: string): ReaderSourceHistoryEntry[] {
      checked(sourcePath)
      return toHistory(readGlobalHistory(globalDir, sourcePath))
    },

    globalSave(sourcePath: string, content: string, baseVersion: number | null): number {
      checked(sourcePath)
      const current = readGlobalLatest(globalDir, sourcePath)?.data
      const baseHash = current && !current.deleted ? current.baseHash : baseSourceHash(runtimeDir(), sourcePath)
      return writeGlobalVersion(globalDir, sourcePath, { content, baseHash }, baseVersion)
    },

    globalRevert(sourcePath: string, baseVersion: number | null): number {
      checked(sourcePath)
      const current = readGlobalLatest(globalDir, sourcePath)
      return writeGlobalVersion(globalDir, sourcePath, { content: "", baseHash: current?.data.baseHash ?? null, deleted: true }, baseVersion)
    },

    globalRestore(sourcePath: string, version: number, baseVersion: number | null): number {
      checked(sourcePath)
      const target = readGlobalHistory(globalDir, sourcePath).find((entry) => entry.version === version)
      if (!target) throw new HTTPException(404, { message: `Version ${version} of ${sourcePath} not found` })
      return writeGlobalVersion(globalDir, sourcePath, target.data, baseVersion)
    },
  }
}

export type ReaderSourceService = ReturnType<typeof createReaderSourceService>
