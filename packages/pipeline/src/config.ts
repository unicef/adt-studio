import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
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

export function loadBookConfig(
  label: string,
  booksRoot: string,
  configPath?: string
): AppConfig {
  const safeLabel = parseBookLabel(label)
  const base = loadConfig(configPath)
  const bookConfigPath = path.join(
    path.resolve(booksRoot),
    safeLabel,
    "config.yaml"
  )
  if (!fs.existsSync(bookConfigPath)) return base
  const overrides = yaml.load(fs.readFileSync(bookConfigPath, "utf-8"))
  return AppConfig.parse(
    deepMerge(base, overrides as Record<string, unknown>)
  )
}
