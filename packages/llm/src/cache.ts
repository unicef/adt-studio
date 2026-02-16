import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import type { Message } from "./types.js"

/**
 * JSON replacer that strips Zod's internal `_cached` property.
 * Zod lazily populates `_cached` after the first `.parse()` call,
 * which changes JSON.stringify output and breaks hash stability.
 */
function stableReplacer(key: string, value: unknown): unknown {
  if (key === "_cached") return undefined
  return value
}

export function computeHash(data: {
  modelId: string
  system?: string
  messages: Message[]
  schema: unknown
}): string {
  const json = JSON.stringify(data, stableReplacer)
  return crypto.createHash("sha256").update(json).digest("hex")
}

export function readCache<T>(cacheDir: string, hash: string): T | null {
  const cacheFile = path.join(cacheDir, `${hash}.json`)
  try {
    if (!fs.existsSync(cacheFile)) return null
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as T
  } catch {
    return null
  }
}

export function writeCache(
  cacheDir: string,
  hash: string,
  result: unknown
): void {
  fs.mkdirSync(cacheDir, { recursive: true })
  const cacheFile = path.join(cacheDir, `${hash}.json`)
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2) + "\n")
}

export function bustCache(cacheDir: string, hash: string): void {
  const cacheFile = path.join(cacheDir, `${hash}.json`)
  try {
    fs.unlinkSync(cacheFile)
  } catch {
    // File may already be gone
  }
}
