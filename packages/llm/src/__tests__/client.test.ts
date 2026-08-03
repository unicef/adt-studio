import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import type { LocalizedText, ProviderManifest, StructuredOutputStrategy } from "@adt/types"
import { createLLMModel } from "../client.js"
import { computeHash, computeCacheKeyV2, readCache, writeCache } from "../cache.js"
import { createProviderRegistry, type ProviderRegistry } from "../registry.js"
import { AiProviderError } from "../ports/errors.js"
import type {
  AnyProviderModule,
  BackendContext,
  CacheFingerprint,
  ProviderModule,
  StructuredTextRequest,
  StructuredTextResult,
} from "../ports/index.js"

const label: LocalizedText = {
  en: "API key",
  "pt-BR": "Chave de API",
  es: "Clave de API",
  fr: "Clé d'API",
  sq: "Kyçi API",
}

interface FakeProviderOptions {
  id?: string
  strategies?: StructuredOutputStrategy[]
  recursiveSchemas?: boolean
  temperature?: boolean
  requiredCredential?: boolean
  fingerprint?: CacheFingerprint
}

function makeManifest(options: FakeProviderOptions): ProviderManifest {
  const id = options.id ?? "fake"
  return {
    id,
    displayName: id,
    modalities: ["structured-text"],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label,
        required: options.requiredCredential ?? false,
        header: `X-ADT-${id}-Key`,
        legacyHeaders: [],
        storageKey: `adt-studio-${id}-key`,
        legacyStorageKeys: [],
      },
    ],
    capabilities: {
      "structured-text": {
        strategies: options.strategies ?? ["native-schema", "json-mode"],
        recursiveSchemas: options.recursiveSchemas ?? true,
        imageInput: false,
        temperature: options.temperature ?? true,
      },
    },
    defaultModels: { "structured-text": "fake-1" },
  }
}

function makeRegistry(options: FakeProviderOptions = {}): {
  registry: ProviderRegistry
  requests: StructuredTextRequest[]
  contexts: Array<BackendContext<{ apiKey?: string }>>
  generate: ReturnType<typeof vi.fn>
} {
  const requests: StructuredTextRequest[] = []
  const contexts: Array<BackendContext<{ apiKey?: string }>> = []
  const generate = vi.fn(
    async (): Promise<StructuredTextResult<unknown>> => ({
      object: { ok: true },
      usage: { inputTokens: 1, outputTokens: 2 },
    }),
  )

  const module: ProviderModule<{ apiKey?: string }> = {
    manifest: makeManifest(options),
    credentialSchema: options.requiredCredential
      ? z.object({ apiKey: z.string().min(1) })
      : z.object({ apiKey: z.string().min(1).optional() }),
    cacheFingerprint: () => options.fingerprint ?? { adapterVersion: "fake-1" },
    createStructuredTextBackend: (context) => {
      contexts.push(context)
      return {
        generateStructured: async <T>(request: StructuredTextRequest) => {
          requests.push(request)
          return (await generate()) as StructuredTextResult<T>
        },
      }
    },
  }

  const registry = createProviderRegistry()
    .register(module as AnyProviderModule)
    .freeze()

  return { registry, requests, contexts, generate }
}

const schema = z.object({ ok: z.boolean() })
const messages = [{ role: "user" as const, content: "hello" }]

describe("createLLMModel provider resolution", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("forwards request-scoped credentials to the resolved backend", async () => {
    const { registry, contexts } = makeRegistry({ id: "openai" })

    const llm = createLLMModel({
      modelId: "openai:gpt-4.1",
      registry,
      credentials: { openaiApiKey: "sk-request" },
      logLevel: "silent",
    })
    await llm.generateObject({ schema, messages })

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.credentials).toEqual({ apiKey: "sk-request" })
    expect(contexts[0]?.modelId).toBe("gpt-4.1")
  })

  it("never forwards one provider's credential to another provider", async () => {
    const { registry, contexts } = makeRegistry({ id: "anthropic" })

    const llm = createLLMModel({
      modelId: "anthropic:claude-3-5-sonnet-latest",
      registry,
      credentials: { openaiApiKey: "sk-openai", anthropicApiKey: "ak-anthropic" },
      logLevel: "silent",
    })
    await llm.generateObject({ schema, messages })

    expect(contexts[0]?.credentials).toEqual({ apiKey: "ak-anthropic" })
  })

  it("merges manifest-driven credentials over the legacy struct", async () => {
    const { registry, contexts } = makeRegistry({ id: "openai" })

    const llm = createLLMModel({
      modelId: "openai:gpt-4.1",
      registry,
      credentials: { openaiApiKey: "sk-legacy" },
      providerCredentials: { openai: { apiKey: "sk-declarative" } },
      logLevel: "silent",
    })
    await llm.generateObject({ schema, messages })

    expect(contexts[0]?.credentials).toEqual({ apiKey: "sk-declarative" })
  })

  it("does not retry a configuration error", async () => {
    const { registry } = makeRegistry({ id: "openai" })

    const llm = createLLMModel({
      modelId: "unregistered:some-model",
      registry,
      logLevel: "silent",
    })

    await expect(
      llm.generateObject({ schema, messages, maxRetries: 5 }),
    ).rejects.toThrow(AiProviderError)
  })

  it("fails with a credential error naming no value when a required key is missing", async () => {
    const { registry } = makeRegistry({ id: "openai", requiredCredential: true })

    const llm = createLLMModel({
      modelId: "openai:gpt-4.1",
      registry,
      logLevel: "silent",
    })

    await expect(llm.generateObject({ schema, messages })).rejects.toThrow(
      AiProviderError,
    )
  })
})

describe("createLLMModel strategy selection", () => {
  it("uses the provider's preferred strategy when no mode is requested", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["native-schema", "json-mode"],
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages })

    expect(requests[0]?.strategy).toBe("native-schema")
  })

  it("honours mode: json when the provider declares json-mode", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["native-schema", "json-mode"],
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, mode: "json" })

    expect(requests[0]?.strategy).toBe("json-mode")
  })

  it("falls back to the provider's preference when mode is unsupported", async () => {
    const { registry, requests } = makeRegistry({ strategies: ["tool-call"] })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, mode: "json" })

    expect(requests[0]?.strategy).toBe("tool-call")
  })

  it("avoids the native strict schema for a recursive schema the provider can't nest", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["native-schema", "json-mode", "tool-call"],
      recursiveSchemas: false,
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, recursiveSchema: true })

    expect(requests[0]?.strategy).toBe("json-mode")
  })

  it("keeps the native strict schema when the provider nests recursion natively", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["native-schema", "json-mode"],
      recursiveSchemas: true,
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, recursiveSchema: true })

    expect(requests[0]?.strategy).toBe("native-schema")
  })

  it("treats a loose schema like a recursive one when native strict can't express it", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["native-schema", "parse-repair"],
      recursiveSchemas: false,
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, looseSchema: true })

    expect(requests[0]?.strategy).toBe("parse-repair")
  })

  it("resolves a recursive schema to tool calling on a tool-only adapter", async () => {
    const { registry, requests } = makeRegistry({
      strategies: ["tool-call"],
      recursiveSchemas: false,
    })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, recursiveSchema: true })

    expect(requests[0]?.strategy).toBe("tool-call")
  })
})

describe("createLLMModel capability gating", () => {
  it("forwards temperature when the model accepts it", async () => {
    const { registry, requests } = makeRegistry({ temperature: true })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, temperature: 0.7 })

    expect(requests[0]?.temperature).toBe(0.7)
  })

  it("drops temperature when the model rejects it", async () => {
    const { registry, requests } = makeRegistry({ temperature: false })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    await llm.generateObject({ schema, messages, temperature: 0.7 })

    expect(requests[0]?.temperature).toBeUndefined()
  })
})

describe("createLLMModel cancellation", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("passes the external signal through to the backend", async () => {
    const { registry, requests } = makeRegistry()

    const controller = new AbortController()
    const llm = createLLMModel({
      modelId: "fake:fake-1",
      registry,
      signal: controller.signal,
      logLevel: "silent",
    })
    await llm.generateObject({ schema, messages })

    expect(requests[0]?.signal).toBe(controller.signal)
    expect(requests[0]?.signal?.aborted).toBe(false)
  })

  it("does not retry when the external signal is aborted", async () => {
    const { registry, generate } = makeRegistry()
    generate.mockRejectedValue(new Error("aborted"))

    const controller = new AbortController()
    controller.abort()
    const llm = createLLMModel({
      modelId: "fake:fake-1",
      registry,
      signal: controller.signal,
      logLevel: "silent",
    })

    await expect(
      llm.generateObject({ schema, messages, maxRetries: 5 }),
    ).rejects.toThrow()
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("still retries a normal failure when no signal is aborted", async () => {
    const { registry, generate } = makeRegistry()
    generate
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ object: { ok: true }, usage: { inputTokens: 1, outputTokens: 1 } })

    const llm = createLLMModel({ modelId: "fake:fake-1", registry, logLevel: "silent" })
    const result = await llm.generateObject<{ ok: boolean }>({
      schema,
      messages,
      maxRetries: 1,
    })

    expect(result.object).toEqual({ ok: true })
    expect(generate).toHaveBeenCalledTimes(2)
  })
})

describe("createLLMModel cache v2", () => {
  const cacheDirs: string[] = []
  function tmpCacheDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-client-cache-"))
    cacheDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of cacheDirs) fs.rmSync(dir, { recursive: true, force: true })
    cacheDirs.length = 0
    vi.clearAllMocks()
  })

  it("promotes a legacy v1 hit for a fixed-origin provider", async () => {
    const fingerprint: CacheFingerprint = {
      adapterVersion: "openai-1",
      origin: "https://api.openai.com",
    }
    const { registry, generate } = makeRegistry({ id: "openai", fingerprint })
    const cacheDir = tmpCacheDir()

    const legacyHash = computeHash({ modelId: "openai:gpt-4.1", messages, schema })
    writeCache(cacheDir, legacyHash, { ok: false })

    const llm = createLLMModel({ modelId: "openai:gpt-4.1", registry, cacheDir, logLevel: "silent" })
    const result = await llm.generateObject<{ ok: boolean }>({ schema, messages })

    expect(result.cached).toBe(true)
    expect(result.object).toEqual({ ok: false })
    expect(generate).not.toHaveBeenCalled()

    const v2Hash = computeCacheKeyV2({
      providerId: "openai",
      modelId: "gpt-4.1",
      fingerprint,
      operation: "structured-text",
      messages,
      schema,
      structuredOutputStrategy: "native-schema",
    })
    expect(readCache(cacheDir, v2Hash)).toEqual({ ok: false })
  })

  it("promotes a legacy v1 hit written with mode: json when the call site now uses a trait", async () => {
    const fingerprint: CacheFingerprint = {
      adapterVersion: "openai-1",
      origin: "https://api.openai.com",
    }
    const { registry, generate } = makeRegistry({
      id: "openai",
      strategies: ["native-schema", "json-mode"],
      recursiveSchemas: false,
      fingerprint,
    })
    const cacheDir = tmpCacheDir()

    const legacyHash = computeHash({ modelId: "openai:gpt-4.1", mode: "json", messages, schema })
    writeCache(cacheDir, legacyHash, { ok: false })

    const llm = createLLMModel({ modelId: "openai:gpt-4.1", registry, cacheDir, logLevel: "silent" })
    const result = await llm.generateObject<{ ok: boolean }>({
      schema,
      messages,
      recursiveSchema: true,
    })

    expect(result.cached).toBe(true)
    expect(result.object).toEqual({ ok: false })
    expect(generate).not.toHaveBeenCalled()

    const v2Hash = computeCacheKeyV2({
      providerId: "openai",
      modelId: "gpt-4.1",
      fingerprint,
      operation: "structured-text",
      messages,
      schema,
      structuredOutputStrategy: "json-mode",
    })
    expect(readCache(cacheDir, v2Hash)).toEqual({ ok: false })
  })

  it("never reads a legacy entry for a configurable-origin provider", async () => {
    const { registry, generate } = makeRegistry({
      id: "custom",
      strategies: ["json-mode"],
      fingerprint: {
        adapterVersion: "openai-compatible-1",
        origin: "https://a.local",
        configurableOrigin: true,
      },
    })
    const cacheDir = tmpCacheDir()

    const legacyHash = computeHash({ modelId: "custom:llama", messages, schema })
    writeCache(cacheDir, legacyHash, { ok: false })

    const llm = createLLMModel({ modelId: "custom:llama", registry, cacheDir, logLevel: "silent" })
    const result = await llm.generateObject<{ ok: boolean }>({ schema, messages })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.object).toEqual({ ok: true })
  })

  it("does not share cache between two custom endpoints with the same model id", async () => {
    const cacheDir = tmpCacheDir()

    const a = makeRegistry({
      id: "custom",
      strategies: ["json-mode"],
      fingerprint: {
        adapterVersion: "openai-compatible-1",
        origin: "https://a.local",
        configurableOrigin: true,
      },
    })
    const b = makeRegistry({
      id: "custom",
      strategies: ["json-mode"],
      fingerprint: {
        adapterVersion: "openai-compatible-1",
        origin: "https://b.local",
        configurableOrigin: true,
      },
    })

    const llmA = createLLMModel({ modelId: "custom:llama", registry: a.registry, cacheDir, logLevel: "silent" })
    await llmA.generateObject({ schema, messages })

    const llmB = createLLMModel({ modelId: "custom:llama", registry: b.registry, cacheDir, logLevel: "silent" })
    const resultB = await llmB.generateObject({ schema, messages })

    expect(a.generate).toHaveBeenCalledTimes(1)
    expect(b.generate).toHaveBeenCalledTimes(1)
    expect(resultB.cached).toBe(false)
  })
})
