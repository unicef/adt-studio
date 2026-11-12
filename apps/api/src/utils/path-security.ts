import fs from "node:fs"
import path from "node:path"

function isWithin(baseDir: string, target: string): boolean {
  const relative = path.relative(baseDir, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Canonicalize existing ancestors without treating dangling links as missing files. */
function resolveWithMissingTail(target: string): string | null {
  let ancestor = target
  const missing: string[] = []
  while (true) {
    try {
      // lstat observes a dangling symlink; realpath must then reject it below.
      fs.lstatSync(ancestor)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null
      const parent = path.dirname(ancestor)
      if (parent === ancestor) return null
      missing.unshift(path.basename(ancestor))
      ancestor = parent
      continue
    }
    try {
      const realAncestor = fs.realpathSync(ancestor)
      if (missing.length > 0 && !fs.statSync(realAncestor).isDirectory()) return null
      return path.resolve(realAncestor, ...missing)
    } catch {
      return null
    }
  }
}

/**
 * Resolve beneath a trusted configured root, checking canonical containment.
 * Each part establishes a narrower boundary: pass book, audio and language
 * separately so a link at any of those levels cannot redefine its own root.
 * Missing files/directories are allowed only beneath checked existing ancestors.
 * Return the normalized requested path so callers can unlink an alias without
 * deleting its target, and keep the requested filename's MIME type.
 * Callers still validate filename/segment syntax and handle missing files.
 * This is not a lock against concurrent changes by another filesystem writer.
 */
export function resolvePathWithin(baseDir: string, ...parts: string[]): string | null {
  let base = path.resolve(baseDir)
  let realBase = resolveWithMissingTail(base)
  if (!realBase) return null
  for (const part of parts) {
    const resolved = path.resolve(base, part)
    if (!isWithin(base, resolved)) return null
    const realResolved = resolveWithMissingTail(resolved)
    if (!realResolved || !isWithin(realBase, realResolved)) return null
    base = resolved
    realBase = realResolved
  }
  return base
}

/** Accept a filesystem-safe route segment, including BCP-47-style locales. */
export function requireSafePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}
