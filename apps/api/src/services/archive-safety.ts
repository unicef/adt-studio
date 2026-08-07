import { unzipSync } from "fflate"

export const ARCHIVE_SAFETY_LIMITS = {
  compressedBytes: 100 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  entries: 10_000,
} as const

export class ArchiveSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ArchiveSafetyError"
  }
}

function isSafeArchivePath(name: string): boolean {
  if (name.length === 0 || name.includes("\0") || name.includes("\\") || name.startsWith("/")) {
    return false
  }
  const parts = name.split("/")
  if (name.endsWith("/")) parts.pop()
  return parts.length > 0 && parts.every((part) => part.length > 0 && part !== "." && part !== "..")
}

function inspect(
  zipBuffer: Buffer,
  include: (path: string) => boolean,
): Record<string, Uint8Array> {
  if (zipBuffer.byteLength > ARCHIVE_SAFETY_LIMITS.compressedBytes) {
    throw new ArchiveSafetyError("Archive exceeds the compressed size limit")
  }

  let entryCount = 0
  let expandedBytes = 0
  const seen = new Set<string>()
  try {
    return unzipSync(zipBuffer, {
      filter(info) {
        entryCount += 1
        if (entryCount > ARCHIVE_SAFETY_LIMITS.entries) {
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
        return include(info.name)
      },
    })
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error
    throw new ArchiveSafetyError("Invalid ZIP file")
  }
}

export function inspectArchivePaths(zipBuffer: Buffer): string[] {
  const paths: string[] = []
  inspect(zipBuffer, (path) => {
    paths.push(path)
    return false
  })
  return paths
}

export function unzipArchiveSafely(zipBuffer: Buffer): Record<string, Uint8Array> {
  return inspect(zipBuffer, () => true)
}
