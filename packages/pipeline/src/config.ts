import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { recoverSectioningTransition } from "@adt/storage"
import { AppConfig, parseBookLabel } from "@adt/types"

/**
 * Deep-merge two plain objects. Plain objects recurse;
 * arrays and primitives: override wins.
 * Explicit `null` in overrides deletes the key from the result.
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown>
): T {
  const result = { ...base } as Record<string, unknown>
  for (const key of Object.keys(overrides)) {
    const baseVal = result[key]
    const overVal = overrides[key]
    if (overVal === null) {
      delete result[key]
    } else if (
      baseVal !== null &&
      typeof baseVal === "object" &&
      typeof overVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>
      )
    } else {
      result[key] = overVal
    }
  }
  return result as T
}

export function loadConfig(configPath?: string): AppConfig {
  const resolved = configPath ?? path.resolve(process.cwd(), "config.yaml")
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`)
  }
  const raw = yaml.load(fs.readFileSync(resolved, "utf-8"))
  return AppConfig.parse(raw)
}

/** A malformed book override must not make other books' Library cards unavailable. */
export class BookConfigError extends Error {
  constructor(readonly label: string, cause: unknown) {
    super(`Cannot read configuration for ${label}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = "BookConfigError"
  }
}

export function loadBookConfig(
  label: string,
  booksRoot: string,
  configPath?: string
): AppConfig {
  const safeLabel = parseBookLabel(label)
  const dir = path.join(path.resolve(booksRoot), safeLabel)
  if (fs.existsSync(dir)) recoverSectioningTransition(dir)
  const base = loadConfig(configPath)
  const bookConfigPath = path.join(
    path.resolve(booksRoot),
    safeLabel,
    "config.yaml"
  )
  let text: string
  try { text = fs.readFileSync(bookConfigPath, "utf-8") }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return base
    throw new BookConfigError(label, error)
  }
  let overrides: unknown
  try { overrides = yaml.load(text) }
  catch (error) { throw new BookConfigError(label, error) }
  if (overrides == null) return base // An empty override inherits the global config.
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new BookConfigError(label, "Expected a configuration mapping.")
  }
  const parsed = AppConfig.safeParse(deepMerge(base, overrides as Record<string, unknown>))
  if (!parsed.success) throw new BookConfigError(label, parsed.error)
  return parsed.data
}
