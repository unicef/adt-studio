import type { Storage } from "@adt/storage"
import {
  READER_SOURCE_MODE_NODE,
  READER_SOURCE_NODE,
  ReaderSourceMode,
  ReaderSourceVersionData,
} from "@adt/types"
import {
  assertBaseVersion,
  ReaderSourceStateError,
  type LatestReaderSource,
  type ReaderSourceVersion,
} from "./versions.js"

const MODE_ITEM = "book"

export function readReaderSourceMode(storage: Storage): ReaderSourceMode {
  const row = storage.getLatestNodeData(READER_SOURCE_MODE_NODE, MODE_ITEM)
  return row ? ReaderSourceMode.parse(row.data) : { followsGlobal: true }
}

export function readBookLatest(storage: Storage, sourcePath: string): ReaderSourceVersion | null {
  const row = storage.getLatestNodeData(READER_SOURCE_NODE, sourcePath)
  return row ? { version: row.version, data: ReaderSourceVersionData.parse(row.data) } : null
}

export function listBookLatest(storage: Storage): LatestReaderSource[] {
  return storage.getNodeItemIds(READER_SOURCE_NODE).flatMap((sourcePath) => {
    const latest = readBookLatest(storage, sourcePath)
    return latest ? [{ path: sourcePath, ...latest }] : []
  })
}

export function readBookHistory(storage: Storage, sourcePath: string): ReaderSourceVersion[] {
  return storage.getAllNodeVersions(READER_SOURCE_NODE, sourcePath).flatMap((row) => {
    const parsed = ReaderSourceVersionData.safeParse(row.data)
    return parsed.success ? [{ version: row.version, data: parsed.data }] : []
  })
}

function putIfChanged(storage: Storage, sourcePath: string, data: ReaderSourceVersionData): void {
  const current = readBookLatest(storage, sourcePath)?.data
  const same = current && current.content === data.content && Boolean(current.deleted) === Boolean(data.deleted)
  if (!same) storage.putNodeData(READER_SOURCE_NODE, sourcePath, data)
}

function detachFromGlobal(storage: Storage, globalFiles: LatestReaderSource[]): void {
  const global = new Map(globalFiles.map((file) => [file.path, file.data]))
  for (const file of listBookLatest(storage)) {
    if (!global.has(file.path) && !file.data.deleted) {
      storage.putNodeData(READER_SOURCE_NODE, file.path, { content: "", baseHash: file.data.baseHash, deleted: true })
    }
  }
  for (const [sourcePath, data] of global) putIfChanged(storage, sourcePath, data)
  storage.putNodeData(READER_SOURCE_MODE_NODE, MODE_ITEM, { followsGlobal: false })
}

function requireCustomized(storage: Storage): void {
  if (readReaderSourceMode(storage).followsGlobal) {
    throw new ReaderSourceStateError("This book follows the global reader. Save a change first to customize it.")
  }
}

export interface SaveBookSourceInput {
  path: string
  content: string
  baseVersion: number | null
  baseHash: string | null
  globalFiles: LatestReaderSource[]
}

export function saveBookSource(storage: Storage, input: SaveBookSourceInput): number {
  return storage.transaction(() => {
    if (readReaderSourceMode(storage).followsGlobal) {
      detachFromGlobal(storage, input.globalFiles)
    } else {
      assertBaseVersion(input.path, readBookLatest(storage, input.path)?.version ?? null, input.baseVersion)
    }
    const current = readBookLatest(storage, input.path)?.data
    const baseHash = current && !current.deleted ? current.baseHash : input.baseHash
    return storage.putNodeData(READER_SOURCE_NODE, input.path, { content: input.content, baseHash })
  })
}

export function revertBookSource(storage: Storage, sourcePath: string, baseVersion: number | null): number {
  return storage.transaction(() => {
    requireCustomized(storage)
    const current = readBookLatest(storage, sourcePath)
    assertBaseVersion(sourcePath, current?.version ?? null, baseVersion)
    return storage.putNodeData(READER_SOURCE_NODE, sourcePath, { content: "", baseHash: current?.data.baseHash ?? null, deleted: true })
  })
}

export function restoreBookSource(storage: Storage, sourcePath: string, version: number, baseVersion: number | null): number | null {
  return storage.transaction(() => {
    requireCustomized(storage)
    assertBaseVersion(sourcePath, readBookLatest(storage, sourcePath)?.version ?? null, baseVersion)
    const target = readBookHistory(storage, sourcePath).find((entry) => entry.version === version)
    return target ? storage.putNodeData(READER_SOURCE_NODE, sourcePath, target.data) : null
  })
}

export function followGlobalReader(storage: Storage): number {
  return storage.putNodeData(READER_SOURCE_MODE_NODE, MODE_ITEM, { followsGlobal: true })
}
