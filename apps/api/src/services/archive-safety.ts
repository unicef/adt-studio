import fs from "node:fs"
import path from "node:path"
import { unzipSync } from "fflate"

/**
 * Limits for project archives (backups and parts).
 *
 * Imports no longer expand a project archive in memory: entries are checked
 * once, then written to disk in bounded batches. Only the upload itself is
 * held in memory, so the compressed size is the real memory bound and the
 * expanded and entry caps only stop zip bombs. They are sized well above the
 * largest real books (a 633 MiB, 5,456-entry backup was refused at 512 MiB).
 */
export const ARCHIVE_SAFETY_LIMITS = {
  compressedBytes: 2 * 1024 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024 * 1024,
  entries: 200_000,
} as const

/** Most expanded bytes held in memory at once while extracting to disk. */
const EXTRACT_BATCH_BYTES = 64 * 1024 * 1024

export function formatArchiveByteLimit(bytes: number): string {
  const gibibytes = bytes / (1024 * 1024 * 1024)
  if (Number.isInteger(gibibytes) && gibibytes >= 1) return `${gibibytes} GiB`
  return `${bytes / (1024 * 1024)} MiB`
}

export class ArchiveSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ArchiveSafetyError"
  }
}

export interface ArchiveEntryInfo {
  name: string
  size: number
}

function isSafeArchivePath(name: string): boolean {
  if (name.length === 0 || name.includes("\0") || name.includes("\\") || name.startsWith("/")) {
    return false
  }
  const parts = name.split("/")
  if (name.endsWith("/")) parts.pop()
  return parts.length > 0 && parts.every((part) => part.length > 0 && part !== "." && part !== "..")
}

function assertCompressedSize(zipBuffer: Buffer): void {
  if (zipBuffer.byteLength > ARCHIVE_SAFETY_LIMITS.compressedBytes) {
    throw new ArchiveSafetyError("Archive exceeds the compressed size limit")
  }
}

/** Run fflate with `filter`, mapping any non-safety failure to "Invalid ZIP file". */
function unzipFiltered(
  zipBuffer: Buffer,
  filter: (info: { name: string; originalSize: number }) => boolean,
): Record<string, Uint8Array> {
  try {
    return unzipSync(zipBuffer, { filter })
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error
    throw new ArchiveSafetyError("Invalid ZIP file")
  }
}

/**
 * Checks every entry (path safety, duplicates, counts, sizes) from the zip
 * directory alone, without inflating anything.
 */
export function inspectArchiveEntries(zipBuffer: Buffer): ArchiveEntryInfo[] {
  assertCompressedSize(zipBuffer)
  const entries: ArchiveEntryInfo[] = []
  const seen = new Set<string>()
  let expandedBytes = 0
  unzipFiltered(zipBuffer, (info) => {
    if (entries.length + 1 > ARCHIVE_SAFETY_LIMITS.entries) {
      throw new ArchiveSafetyError("Archive contains too many entries")
    }
    if (!isSafeArchivePath(info.name)) {
      throw new ArchiveSafetyError(`Archive contains an unsafe path: ${info.name}`)
    }
    if (seen.has(info.name)) {
      throw new ArchiveSafetyError(`Archive contains a duplicate path: ${info.name}`)
    }
    seen.add(info.name)
    if (!Number.isSafeInteger(info.originalSize) || info.originalSize < 0) {
      throw new ArchiveSafetyError("Archive contains an invalid entry size")
    }
    expandedBytes += info.originalSize
    if (expandedBytes > ARCHIVE_SAFETY_LIMITS.expandedBytes) {
      throw new ArchiveSafetyError("Archive exceeds the expanded size limit")
    }
    entries.push({ name: info.name, size: info.originalSize })
    return false
  })
  return entries
}

export function inspectArchivePaths(zipBuffer: Buffer): string[] {
  return inspectArchiveEntries(zipBuffer).map((entry) => entry.name)
}

/** Inflate only the named entries (after a full safety check). */
export function readArchiveEntries(
  zipBuffer: Buffer,
  names: Iterable<string>,
): Record<string, Uint8Array> {
  inspectArchiveEntries(zipBuffer)
  const wanted = new Set(names)
  return unzipFiltered(zipBuffer, (info) => wanted.has(info.name))
}

/**
 * Writes the archive to disk without expanding it in memory as a whole.
 * `destinationFor` maps an entry name to an absolute file path, or null to
 * skip it. Directory entries are skipped. Files are written in batches of at
 * most EXTRACT_BATCH_BYTES (or one larger entry).
 */
export function extractArchiveToDisk(
  zipBuffer: Buffer,
  destinationFor: (name: string) => string | null,
): void {
  const entries = inspectArchiveEntries(zipBuffer).filter((entry) => !entry.name.endsWith("/"))
  const targets = new Map<string, string>()
  for (const entry of entries) {
    const destination = destinationFor(entry.name)
    if (destination) targets.set(entry.name, destination)
  }

  let batch = new Set<string>()
  let batchBytes = 0
  const flush = () => {
    if (batch.size === 0) return
    const current = batch
    const files = unzipFiltered(zipBuffer, (info) => current.has(info.name))
    for (const [name, data] of Object.entries(files)) {
      const destination = targets.get(name)!
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, data)
    }
    batch = new Set()
    batchBytes = 0
  }
  for (const entry of entries) {
    if (!targets.has(entry.name)) continue
    if (batch.size > 0 && batchBytes + entry.size > EXTRACT_BATCH_BYTES) flush()
    batch.add(entry.name)
    batchBytes += entry.size
  }
  flush()
}

/** Expanded-size cap for archives that are still expanded in memory as a whole. */
export const IN_MEMORY_EXPANDED_BYTES = 1024 * 1024 * 1024

/** Whole-archive expansion in memory. Only for small archives (parts). */
export function unzipArchiveSafely(zipBuffer: Buffer): Record<string, Uint8Array> {
  const expanded = inspectArchiveEntries(zipBuffer).reduce((sum, entry) => sum + entry.size, 0)
  if (expanded > IN_MEMORY_EXPANDED_BYTES) {
    throw new ArchiveSafetyError("Archive exceeds the expanded size limit")
  }
  return unzipFiltered(zipBuffer, () => true)
}
