import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { DEFAULT_BASE_PROMPT_MODEL_ID, DEFAULT_LLM_MODEL_ID } from "@adt/types"
import { openaiProvider } from "../providers/openai/index.js"
import { solInferenceOptions } from "../providers/openai/sol.js"
import { createProviderRegistry } from "../registry.js"
import { createLLMModel } from "../client.js"
import { runAgentLoop } from "../agent-loop.js"
import { computeHash, computeCacheKeyV2, writeCache } from "../cache.js"
import type { LlmLogEntry } from "../log.js"
import type { StructuredTextRequest } from "../ports/index.js"

const fetchMock = vi.fn()
const modelId = "openai:gpt-6.1-sol"
const credentials = { openai: { apiKey: "sk-private-fixture" } }
const context = { providerId: "openai", modelId: "gpt-6.1-sol", modality: "structured-text" as const, credentials: credentials.openai }
const schema = z.object({ title: z.string() })
const messages = [{ role: "user" as const, content: "Extract this page" }]
const reasoningItem = { type: "reasoning", id: "rs_1", encrypted_content: "opaque", summary: [] }
let cacheDir: string

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-sol-"))
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(cacheDir, { recursive: true, force: true })
})

function response(output: unknown[], status = "completed"): Response {
  return new Response(JSON.stringify({ model: "gpt-6.1-sol", status, output,
    usage: { input_tokens: 10, output_tokens: 20, input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 12 } },
  }), { headers: { "Content-Type": "application/json" } })
}
function textResponse(text = '{"title":"Page"}') {
  return response([reasoningItem, { type: "message", id: "msg_1", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text }] }])
}
function body(index: number): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[index][1].body)
}
function registry(adapterVersion?: string) {
  return createProviderRegistry().register({ ...openaiProvider,
    ...(adapterVersion ? { cacheFingerprint: () => ({ adapterVersion, legacyCacheReadable: false }) } : {}),
  }).freeze()
}
function client(adapterVersion?: string, onLog?: (entry: LlmLogEntry) => void) {
  return createLLMModel({ modelId, registry: registry(adapterVersion), providerCredentials: credentials, cacheDir, logLevel: "silent", onLog })
}

describe("Sol migration", () => {
  it("AC-1: selects Sol for text and agents while retaining base provenance and specialized models", () => {
    expect(DEFAULT_LLM_MODEL_ID).toBe(modelId)
    expect(DEFAULT_BASE_PROMPT_MODEL_ID).toBe("openai:gpt-5.4")
    expect(openaiProvider.manifest.defaultModels).toMatchObject({ "structured-text": "gpt-6.1-sol", agent: "gpt-6.1-sol", image: "gpt-image-2", tts: "gpt-4o-mini-tts", stt: "whisper-1" })
  })

  it.each([undefined, "none", "minimal", "low", "medium", "high", "xhigh", "max"])(
    "AC-2: normalizes effective effort %s without mutating saved options", (effort) => {
      const options = { openai: { reasoningEffort: effort, topP: 0.9, logprobs: true } }
      const original = structuredClone(options)
      const effective = solInferenceOptions(options)
      expect(effective).toEqual({ endpoint: "responses", providerOptions: { openai: {
        reasoningEffort: [undefined, "none", "minimal"].includes(effort) ? "low" : effort,
      } } })
      expect(options).toEqual(original)
    },
  )

  it.each(["native-schema", "json-mode", "tool-call", "parse-repair"] as const)(
    "AC-2: preserves page images and output contracts in %s without unsupported sampling", async (strategy) => {
      fetchMock.mockResolvedValue(strategy === "tool-call" ? response([{ type: "function_call", name: "structured_output", call_id: "call_1", arguments: '{"title":"Page"}' }]) : textResponse())
      const backend = openaiProvider.createStructuredTextBackend!(context)
      const result = await backend.generateStructured({ schema, strategy, temperature: 0.8, maxTokens: 100,
        providerOptions: { openai: { reasoningEffort: "max", topP: 1, logprobs: true } },
        messages: [{ role: "user", content: [{ type: "text", text: "Page" }, { type: "image", image: "data:image/png;base64,iVBORw0KGgo" }] }],
      })
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses")
      expect(body(0)).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "max" }, max_output_tokens: 100, store: false,
        input: [{ role: "user", content: [{ type: "input_text", text: "Page" }, { type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo" }] }],
      })
      for (const key of ["temperature", "top_p", "logprobs", "top_logprobs"]) expect(body(0)).not.toHaveProperty(key)
      if (strategy === "tool-call") expect(body(0)).toHaveProperty("tool_choice", { type: "function", name: "structured_output" })
      expect(result.object).toEqual({ title: "Page" })
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 })
    },
  )

  it("AC-2: maps nullable optional wire fields back to the caller's schema", async () => {
    fetchMock.mockResolvedValue(textResponse('{"title":"Page","subtitle":null}'))
    const result = await openaiProvider.createStructuredTextBackend!(context).generateStructured({
      schema: z.object({ title: z.string(), subtitle: z.string().optional() }), strategy: "native-schema", messages,
    })
    expect(result.object).toEqual({ title: "Page" })
    expect(body(0)).toHaveProperty("text.format.schema.required", ["title", "subtitle"])
  })

  it("AC-2: repairs JSON with the same effort and reasoning continuation, adding all billed usage", async () => {
    fetchMock.mockResolvedValueOnce(textResponse('{"title":42}')).mockResolvedValueOnce(textResponse())
    const result = await openaiProvider.createStructuredTextBackend!(context).generateStructured({
      schema, messages, strategy: "parse-repair", providerOptions: { openai: { reasoningEffort: "high" } },
    })
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 40 })
    expect(body(1)).toHaveProperty("reasoning.effort", "high")
    expect(body(1).input).toContainEqual(reasoningItem)
    expect(result.params).toMatchObject({ attempts: 2, returnedModel: "gpt-6.1-sol" })
  })

  it("AC-2: respects external cancellation and the request timeout", async () => {
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    }))
    const backend = openaiProvider.createStructuredTextBackend!(context)
    const request: StructuredTextRequest = { schema, messages, strategy: "native-schema" }
    const controller = new AbortController()
    const pending = backend.generateStructured({ ...request, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow()
    await expect(backend.generateStructured({ ...request, timeoutMs: 5 })).rejects.toThrow()
  })

  it("AC-2: reports an unavailable model clearly without substituting another model or exposing credentials", async () => {
    fetchMock.mockResolvedValue(new Response("sk-private-fixture", { status: 403 }))
    const entries: LlmLogEntry[] = []
    await expect(client(undefined, (entry) => entries.push(entry)).generateObject({ schema, messages, maxRetries: 3,
      log: { taskType: "sectioning", promptName: "page_sectioning" },
    })).rejects.toThrow("verify access to gpt-6.1-sol")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(body(0).model).toBe("gpt-6.1-sol")
    expect(JSON.stringify(entries)).not.toContain("sk-private-fixture")
  })

  it("AC-4: identical calls hit cache; effort, prompt and adapter changes miss, and legacy Sol entries are skipped", async () => {
    fetchMock.mockImplementation(async () => textResponse())
    writeCache(cacheDir, computeHash({ modelId, messages, schema }), { title: "Unsafe legacy hit" })
    const llm = client()
    const first = await llm.generateObject({ schema, messages })
    expect(first.cached).toBe(false)
    expect((await llm.generateObject({ schema, messages, providerOptions: { openai: { reasoningEffort: "none" } } })).cached).toBe(true)
    expect((await llm.generateObject({ schema, messages, providerOptions: { openai: { reasoningEffort: "high" } } })).cached).toBe(false)
    expect((await llm.generateObject({ schema, messages: [{ role: "user", content: "Changed page" }] })).cached).toBe(false)
    expect((await client("openai-sol-responses-2").generateObject({ schema, messages })).cached).toBe(false)
    const key = { providerId: "openai", modelId: "gpt-6.1-sol", fingerprint: { adapterVersion: "test" }, operation: "structured-text", messages, schema }
    expect(computeCacheKeyV2(key)).not.toBe(computeCacheKeyV2({ ...key, modelId: "gpt-5.4" }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("AC-4: logs effective parameters and all failed repair usage without double-counting reasoning", async () => {
    fetchMock.mockImplementation(async () => textResponse('{"title":false}'))
    const entries: LlmLogEntry[] = []
    const llm = createLLMModel({ modelId, registry: createProviderRegistry().register({ ...openaiProvider,
      capabilitiesFor: (modality) => modality === "structured-text"
        ? ({ ...openaiProvider.manifest.capabilities["structured-text"]!, strategies: ["parse-repair"], temperature: false } as never)
        : undefined,
    }).freeze(), providerCredentials: credentials, onLog: (entry) => entries.push(entry), logLevel: "silent" })
    await expect(llm.generateObject({ schema, messages, log: { taskType: "sectioning", promptName: "page_sectioning" } })).rejects.toThrow("schema-valid JSON")
    expect(entries[0].usage).toEqual({ inputTokens: 20, outputTokens: 40 })
    expect(entries[0].params).toMatchObject({ requestedModel: modelId, returnedModel: "gpt-6.1-sol", endpoint: "responses", providerOptions: { openai: { reasoningEffort: "low" } }, attempts: 2 })
  })

  it("AC-2: validates function arguments before execution and logs billed usage on rejection", async () => {
    fetchMock.mockResolvedValue(response([{ type: "function_call", call_id: "call_1", name: "read_page", arguments: '{"page":"invalid"}' }]))
    const execute = vi.fn()
    const entries: LlmLogEntry[] = []
    await expect(runAgentLoop({ modelId, system: "Inspect", prompt: "Go", registry: registry(), credentials, logLevel: "silent",
      tools: { read_page: { description: "Read", parameters: z.object({ page: z.number() }), execute } },
      log: { taskType: "agent", promptName: "agent" }, onLog: (entry) => entries.push(entry),
    })).rejects.toThrow("outside the read_page tool schema")
    expect(execute).not.toHaveBeenCalled()
    expect(entries[0].usage).toEqual({ inputTokens: 10, outputTokens: 20 })
  })

  it("AC-2: preserves function IDs, results and opaque reasoning across turns and local cache replay", async () => {
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      const request = JSON.parse(init.body as string)
      const hasResult = request.input.some((item: Record<string, unknown>) => item.type === "function_call_output")
      return hasResult ? textResponse("Done") : response([reasoningItem, { type: "function_call", id: "fc_1", call_id: "call_1", name: "read_page", arguments: '{"page":1}' }])
    })
    const execute = vi.fn(() => ({ title: "Page" }))
    const entries: LlmLogEntry[] = []
    const options = { modelId, system: "Inspect the page", prompt: "Go", registry: registry(), credentials, cacheDir, temperature: 0.5,
      tools: { read_page: { description: "Read page", parameters: z.object({ page: z.number() }), execute } },
      onLog: (entry: LlmLogEntry) => entries.push(entry), log: { taskType: "agent", promptName: "agent" }, logLevel: "silent" as const }
    const first = await runAgentLoop(options)
    expect(first.text).toBe("Done")
    expect(body(1).input).toContainEqual(reasoningItem)
    expect(body(1).input).toContainEqual({ type: "function_call_output", call_id: "call_1", output: '{"title":"Page"}' })
    expect(body(0)).not.toHaveProperty("temperature")
    const cached = await runAgentLoop(options)
    expect(cached.turns.every((turn) => turn.cacheHit)).toBe(true)
    expect(cached.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(entries.at(-1)?.usage).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(2) // Effects are never cached.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    execute.mockImplementation(() => ({ title: "Changed page" }))
    const changed = await runAgentLoop(options)
    expect(changed.turns[0].cacheHit).toBe(true)
    expect(changed.turns[1].cacheHit).toBe(false)
    expect(body(2).input).toContainEqual(reasoningItem)
    expect(body(2).input).toContainEqual({ type: "function_call_output", call_id: "call_1", output: '{"title":"Changed page"}' })
    await runAgentLoop({ ...options, providerOptions: { openai: { reasoningEffort: "medium" } } })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
