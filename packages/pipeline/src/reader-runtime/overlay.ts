import { createHash } from "node:crypto"
import type { Storage } from "@adt/storage"
import { listBookLatest, readReaderSourceMode } from "./book-store.js"
import { listGlobalLatest } from "./global-store.js"

export interface ReaderOverlayFile {
  path: string
  content: string
  layer: "global" | "book"
  version: number
  baseHash: string | null
}

export interface ReaderOverlay {
  followsGlobal: boolean
  files: ReaderOverlayFile[]
}

export function resolveReaderOverlay(storage: Storage, globalDir: string): ReaderOverlay {
  const { followsGlobal } = readReaderSourceMode(storage)
  const layer: ReaderOverlayFile["layer"] = followsGlobal ? "global" : "book"
  const latest = followsGlobal ? listGlobalLatest(globalDir) : listBookLatest(storage)
  return {
    followsGlobal,
    files: latest
      .filter((file) => !file.data.deleted)
      .map((file) => ({ path: file.path, content: file.data.content, layer, version: file.version, baseHash: file.data.baseHash }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export function readerOverlayHash(files: ReadonlyArray<Pick<ReaderOverlayFile, "path" | "content">>): string {
  const entries = [...files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => [file.path, file.content])
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex")
}
