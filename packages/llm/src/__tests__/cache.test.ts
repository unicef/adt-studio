import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  computeHash,
  computeCacheKeyV2,
  isLegacyCacheReadable,
  readCache,
  writeCache,
  bustCache,
} from "../cache.js"
import type { Message } from "../types.js"

const dirs: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-cache-test-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

describe("computeHash", () => {
  it("produces deterministic hashes", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
    ]
    const h1 = computeHash({ modelId: "openai:gpt-4o", system: "test", messages, schema: {} })
    const h2 = computeHash({ modelId: "openai:gpt-4o", system: "test", messages, schema: {} })
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64) // SHA-256 hex
  })

  it("produces different hashes for different inputs", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }]
    const h1 = computeHash({ modelId: "openai:gpt-4o", messages, schema: {} })
    const h2 = computeHash({ modelId: "openai:gpt-4o-mini", messages, schema: {} })
    expect(h1).not.toBe(h2)
  })

  it("ignores _cached property in schema for stable hashing", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }]
    const schemaWithoutCached = {
      _def: { typeName: "ZodObject" },
      _cached: null,
    }
    const schemaWithCached = {
      _def: { typeName: "ZodObject" },
      _cached: { shape: { a: { _def: { typeName: "ZodString" } } } },
    }
    const h1 = computeHash({ modelId: "openai:gpt-4o", messages, schema: schemaWithoutCached })
    const h2 = computeHash({ modelId: "openai:gpt-4o", messages, schema: schemaWithCached })
    expect(h1).toBe(h2)
  })
})

describe("computeCacheKeyV2", () => {
  const base = {
    providerId: "custom",
    modelId: "llama-3.1",
    operation: "structured-text",
    messages: [{ role: "user" as const, content: "hello" }],
    schema: {},
    structuredOutputStrategy: "json-mode",
  }

  it("is deterministic for identical inputs", () => {
    const fingerprint = { adapterVersion: "openai-compatible-1", origin: "https://a.local" }
    const h1 = computeCacheKeyV2({ ...base, fingerprint })
    const h2 = computeCacheKeyV2({ ...base, fingerprint })
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it("differs when only the backend origin differs", () => {
    const a = computeCacheKeyV2({
      ...base,
      fingerprint: { adapterVersion: "openai-compatible-1", origin: "https://a.local" },
    })
    const b = computeCacheKeyV2({
      ...base,
      fingerprint: { adapterVersion: "openai-compatible-1", origin: "https://b.local" },
    })
    expect(a).not.toBe(b)
  })

  it("differs when the effective strategy differs", () => {
    const fingerprint = { adapterVersion: "openai-1", origin: "https://api.openai.com" }
    const a = computeCacheKeyV2({ ...base, fingerprint, structuredOutputStrategy: "json-mode" })
    const b = computeCacheKeyV2({ ...base, fingerprint, structuredOutputStrategy: "native-schema" })
    expect(a).not.toBe(b)
  })

  it("differs from the v1 hash of the same request", () => {
    const fingerprint = { adapterVersion: "openai-1", origin: "https://api.openai.com" }
    const v2 = computeCacheKeyV2({ ...base, fingerprint })
    const v1 = computeHash({ modelId: "custom:llama-3.1", messages: base.messages, schema: {} })
    expect(v2).not.toBe(v1)
  })
})

describe("isLegacyCacheReadable", () => {
  it("allows a fixed-origin backend", () => {
    expect(isLegacyCacheReadable({ adapterVersion: "openai-1", origin: "https://api.openai.com" })).toBe(true)
  })

  it("rejects a configurable-origin backend", () => {
    expect(
      isLegacyCacheReadable({
        adapterVersion: "openai-compatible-1",
        origin: "https://a.local",
        configurableOrigin: true,
      }),
    ).toBe(false)
  })
})

describe("readCache / writeCache / bustCache", () => {
  it("returns null for missing cache", () => {
    const dir = tmpDir()
    const result = readCache(dir, "nonexistent")
    expect(result).toBeNull()
  })

  it("round-trips a cached value", () => {
    const dir = tmpDir()
    const data = { reasoning: "test", groups: [] }
    writeCache(dir, "abc123", data)
    const result = readCache(dir, "abc123")
    expect(result).toEqual(data)
  })

  it("creates cache directory if needed", () => {
    const dir = path.join(tmpDir(), "nested", "cache")
    writeCache(dir, "test", { value: 1 })
    expect(readCache(dir, "test")).toEqual({ value: 1 })
  })

  it("bustCache removes the file", () => {
    const dir = tmpDir()
    writeCache(dir, "tobust", { x: 1 })
    expect(readCache(dir, "tobust")).toEqual({ x: 1 })
    bustCache(dir, "tobust")
    expect(readCache(dir, "tobust")).toBeNull()
  })

  it("bustCache is safe on missing files", () => {
    const dir = tmpDir()
    expect(() => bustCache(dir, "nope")).not.toThrow()
  })
})
