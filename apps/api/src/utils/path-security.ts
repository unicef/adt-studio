import fs from "node:fs"
import path from "node:path"

/**
 * Resolve a path under a directory and reject lexical traversal outside it.
 * Callers should still validate the requested path's format when the route
 * expects a single filename or path segment.
 */
export function resolvePathWithin(baseDir: string, ...parts: string[]): string | null {
  const resolvedBase = path.resolve(baseDir)
  const resolved = path.resolve(resolvedBase, ...parts)
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    return null
  }

  // If the target exists, enforce the same boundary after following links.
  // This keeps a symlink inside the book from becoming another escape route.
  try {
    const realBase = fs.realpathSync(resolvedBase)
    const realResolved = fs.realpathSync(resolved)
    if (realResolved !== realBase && !realResolved.startsWith(`${realBase}${path.sep}`)) {
      return null
    }
  } catch {
    // Missing targets are handled by the caller; the lexical check above still
    // protects paths that will be created below the base directory.
  }
  return resolved
}

/** Accept a filesystem-safe route segment, including BCP-47-style locales. */
export function requireSafePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}
