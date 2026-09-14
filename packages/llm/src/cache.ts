import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import type { Message } from "./types.js"
import type { CacheFingerprint } from "./ports/common.js"

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
  mode?: string
  system?: string
  messages: Message[]
  schema: unknown
  temperature?: number
}): string {
  return computeCacheHash(data)
}

export function computeCacheHash(data: unknown): string {
  const json = JSON.stringify(data, stableReplacer)
  return crypto.createHash("sha256").update(json).digest("hex")
}

/** Inputs for the v2 cache key. Nothing here may hold a secret. */
export interface CacheKeyV2Input {
  providerId: string
  /** Provider-scoped model id (case preserved, no provider prefix). */
  modelId: string
  fingerprint: CacheFingerprint
  /** Modality/operation discriminator, e.g. "structured-text" or "image". */
  operation: string
  system?: string
  messages: Message[]
  schema: unknown
  /** Effective structured-output strategy, resolved before the cache lookup. */
  structuredOutputStrategy?: string
  temperature?: number
  maxTokens?: number
  providerOptions?: unknown
}

/**
 * v2 binds every result to the concrete backend that produced it: provider,
 * model, adapter version, normalized origin and effective strategy all enter the
 * key, so two endpoints answering the same model id never collide.
 */
export function computeCacheKeyV2(input: CacheKeyV2Input): string {
  return computeCacheHash({
    cacheVersion: 2,
    providerId: input.providerId,
    modelId: input.modelId,
    backendFingerprint: {
      adapterVersion: input.fingerprint.adapterVersion,
      origin: input.fingerprint.origin,
      extra: input.fingerprint.extra,
    },
    operation: input.operation,
    system: input.system,
    messages: input.messages,
    schema: input.schema,
    structuredOutputStrategy: input.structuredOutputStrategy,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    providerOptions: input.providerOptions,
  })
}

/**
 * A legacy v1 entry may be reused only when the backend's identity is
 * unambiguous. The v1 key omitted the origin, so any provider whose endpoint is
 * user-configurable (custom, Ollama) could have written a colliding entry from a
 * different server — correctness beats an unsafe hit, so those skip the v1 read.
 */
export function isLegacyCacheReadable(fingerprint: CacheFingerprint): boolean {
  return fingerprint.configurableOrigin !== true
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
