import fs from "node:fs"
import path from "node:path"
import { Zip, ZipDeflate, ZipPassThrough } from "fflate"

/** File extensions that are already compressed — skip deflation to save CPU */
const COMPRESSED_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
  ".mp3", ".mp4", ".ogg", ".wav", ".aac", ".m4a", ".opus", ".flac",
  ".zip", ".gz", ".br", ".zst",
  ".woff", ".woff2",
  ".pdf", ".db",
])

/** An in-memory file to add to the zip in addition to the on-disk tree. */
export interface ExtraZipEntry {
  /** Path inside the archive (e.g. "part.json"). */
  path: string
  data: Uint8Array
}

export interface ZipStreamOptions {
  /** Top-level directory names to skip (e.g. "adt", "webpub"). */
  excludeDirs?: Set<string>
  /** In-memory entries appended after the on-disk files. Override on-disk
   *  files with the same path by listing them in `excludeFiles`. */
  extraEntries?: ExtraZipEntry[]
  /** Relative paths to skip from the on-disk tree (so an extraEntry can
   *  replace them — e.g. a rewritten config.yaml). */
  excludeFiles?: Set<string>
}

/**
 * Collect relative file paths under a directory (lightweight — no file content read).
 */
export function collectFilePaths(dir: string, prefix = "", excludeDirs?: Set<string>): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (excludeDirs && !prefix && excludeDirs.has(entry.name)) continue
      result.push(...collectFilePaths(path.join(dir, entry.name), zipPath, excludeDirs))
    } else if (entry.isFile()) {
      result.push(zipPath)
    }
  }
  return result
}

/**
 * Create a streaming ZIP from a fixed list of in-memory entries (no directory
 * walk). Used for the lightweight "part" archive (pdf + config.yaml + part.json).
 */
export function createZipStreamFromEntries(
  entries: ExtraZipEntry[],
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        if (chunk.length > 0) controller.enqueue(chunk)
        if (final) controller.close()
      })
      for (const entry of entries) {
        addEntry(zip, entry.path, entry.data)
      }
      zip.end()
    },
  })
}

function addEntry(zip: Zip, relPath: string, data: Uint8Array): void {
  const ext = path.extname(relPath).toLowerCase()
  const file = COMPRESSED_EXTS.has(ext)
    ? new ZipPassThrough(relPath)
    : new ZipDeflate(relPath, { level: 6 })
  zip.add(file)
  file.push(data, true)
}

/**
 * Create a streaming ZIP of a directory plus any in-memory entries. Files are
 * read and compressed one at a time so memory stays bounded regardless of
 * total directory size.
 */
export function createZipStream(
  sourceDir: string,
  options: ZipStreamOptions = {},
): ReadableStream<Uint8Array> {
  const { excludeDirs, extraEntries = [], excludeFiles } = options
  const filePaths = collectFilePaths(sourceDir, "", excludeDirs).filter(
    (p) => !excludeFiles?.has(p),
  )

  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        if (chunk.length > 0) controller.enqueue(chunk)
        if (final) controller.close()
      })

      for (let i = 0; i < filePaths.length; i++) {
        const relPath = filePaths[i]
        const absPath = path.join(sourceDir, relPath)
        addEntry(zip, relPath, new Uint8Array(fs.readFileSync(absPath)))

        // Yield to event loop every 50 files to avoid blocking
        if (i % 50 === 49) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }

      for (const entry of extraEntries) {
        addEntry(zip, entry.path, entry.data)
      }

      zip.end()
    },
  })
}
