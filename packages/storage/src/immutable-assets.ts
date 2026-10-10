import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/** Resolve every existing boundary, including the configured root. Never use a
 * lexical fallback after an error: a dangling symlink is not a new directory. */
function assetDirectory(bookDir: string, segments: string[]): string {
  const root = fs.realpathSync(bookDir)
  let current = root
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9_-]+$/.test(segment)) throw new Error("Invalid asset directory")
    const next = path.join(current, segment)
    try { fs.mkdirSync(next) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    current = fs.realpathSync(next)
    const relative = path.relative(root, current)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Asset directory escapes book")
  }
  return current
}

/** Write bytes before publishing a manifest. Names depend on bytes, not the
 * request cache, so forced/retried generations cannot overwrite retained work.
 * A failed publication can leave an unreferenced asset; it never alters a live
 * reference. Assets are intentionally not garbage-collected with LLM caches. */
export function storeImmutableAsset(
  bookDir: string,
  directories: string[],
  prefix: string,
  extension: string,
  bytes: Uint8Array,
): { fileName: string; contentHash: string } {
  if (!/^[a-zA-Z0-9_.-]+$/.test(prefix) || !/^[a-zA-Z0-9]+$/.test(extension)) {
    throw new Error("Invalid asset name")
  }
  if (bytes.byteLength === 0) throw new Error("Cannot store an empty asset")
  const directory = assetDirectory(bookDir, directories)
  const contentHash = createHash("sha256").update(bytes).digest("hex")
  const fileName = `${prefix}--${contentHash}.${extension.toLowerCase()}`
  const destination = path.join(directory, fileName)
  // Do not follow a pre-existing symlink or silently accept corrupt bytes.
  if (fs.existsSync(destination)) {
    if (!fs.lstatSync(destination).isFile() || !fs.readFileSync(destination).equals(Buffer.from(bytes))) {
      throw new Error("Retained asset does not match its content identity")
    }
    return { fileName, contentHash }
  }
  const temporary = path.join(directory, `.pending-${randomUUID()}`)
  const fd = fs.openSync(temporary, "wx", 0o600)
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
  try {
    // Exclusive hard-link publication cannot replace an existing asset. The
    // temporary inode has already been flushed and is in the same directory.
    fs.linkSync(temporary, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" ||
        !fs.lstatSync(destination).isFile() ||
        !fs.readFileSync(destination).equals(Buffer.from(bytes))) throw error
  } finally { fs.unlinkSync(temporary) }
  return { fileName, contentHash }
}

/** Read a retained asset only after resolving every boundary beneath the book. */
export function readBookAsset(bookDir: string, relativePath: string): Buffer {
  const root = fs.realpathSync(bookDir)
  const file = fs.realpathSync(path.resolve(root, relativePath))
  const relative = path.relative(root, file)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw new Error("Invalid book asset")
  return fs.readFileSync(file)
}
