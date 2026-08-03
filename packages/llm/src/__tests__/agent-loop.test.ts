import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { AgentCapabilities, LocalizedText, ProviderManifest } from "@adt/types"
import { runAgentLoop } from "../agent-loop.js"
import { createProviderRegistry, type ProviderRegistry } from "../registry.js"
import { AiProviderError } from "../ports/errors.js"
import type { LlmLogEntry } from "../log.js"
import type {
  AgentToolSet,
  AgentTurnRequest,
  AgentTurnResponse,
  AnyProviderModule,
  ProviderModule,
} from "../ports/index.js"

const label: LocalizedText = {
  en: "API key",
  "pt-BR": "Chave de API",
  es: "Clave de API",
  fr: "Clé d'API",
  sq: "Kyçi API",
}

function makeManifest(agent: AgentCapabilities): ProviderManifest {
  return {
    id: "fake",
    displayName: "Fake",
    modalities: ["agent"],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label,
        required: false,
        header: "X-ADT-Fake-Key",
        legacyHeaders: [],
        storageKey: "adt-studio-fake-key",
        legacyStorageKeys: [],
      },
    ],
    capabilities: { agent },
    defaultModels: { agent: "fake-1" },
  }
}

function makeRegistry(
  responses: AgentTurnResponse[],
  agent: AgentCapabilities = { tools: true, streaming: false },
): {
  registry: ProviderRegistry
  requests: AgentTurnRequest[]
  turnCount: () => number
} {
  const requests: AgentTurnRequest[] = []
  let calls = 0

  const module: ProviderModule<{ apiKey?: string }> = {
    manifest: makeManifest(agent),
    credentialSchema: z.object({ apiKey: z.string().optional() }),
    cacheFingerprint: () => ({ adapterVersion: "fake-1" }),
    createAgentBackend: () => ({
      generateTurn: async (request) => {
        requests.push({ ...request, messages: structuredClone(request.messages) })
        const response = responses[calls] ?? responses[responses.length - 1]
        calls++
        if (!response) throw new Error("no response configured")
        return response
      },
    }),
  }

  return {
    registry: createProviderRegistry()
      .register(module as AnyProviderModule)
      .freeze(),
    requests,
    turnCount: () => calls,
  }
}

function textTurn(text: string): AgentTurnResponse {
  return {
    text,
    toolCalls: [],
    finishReason: "stop",
    usage: { inputTokens: 3, outputTokens: 4 },
  }
}

function toolTurn(toolName: string, args: unknown): AgentTurnResponse {
  return {
    text: "",
    toolCalls: [{ id: `call-${toolName}`, toolName, args }],
    finishReason: "tool-calls",
    usage: { inputTokens: 1, outputTokens: 2 },
  }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-agent-loop-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe("runAgentLoop", () => {
  it("stops on the first turn with no tool calls", async () => {
    const { registry, turnCount } = makeRegistry([textTurn("done")])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools: {},
      registry,
      logLevel: "silent",
    })

    expect(turnCount()).toBe(1)
    expect(result.text).toBe("done")
    expect(result.stepCount).toBe(1)
    expect(result.finishReason).toBe("stop")
  })

  it("executes tool calls and feeds results back into the transcript", async () => {
    const execute = vi.fn(async (args: { value: number }) => ({ doubled: args.value * 2 }))
    const tools: AgentToolSet = {
      double: { description: "double a number", parameters: z.object({ value: z.number() }), execute },
    }
    const { registry, requests } = makeRegistry([
      toolTurn("double", { value: 21 }),
      textTurn("42"),
    ])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "double 21",
      tools,
      registry,
      logLevel: "silent",
    })

    expect(execute).toHaveBeenCalledWith({ value: 21 })
    expect(result.text).toBe("42")
    expect(result.turns[0]?.toolResults).toEqual([
      { id: "call-double", toolName: "double", result: { doubled: 42 } },
    ])
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "double 21" },
      { role: "assistant", text: "", toolCalls: [{ id: "call-double", toolName: "double", args: { value: 21 } }] },
      { role: "tool", results: [{ id: "call-double", toolName: "double", result: { doubled: 42 } }] },
    ])
  })

  it("never sends execute to the backend", async () => {
    const tools: AgentToolSet = {
      noop: { description: "noop", parameters: z.object({}), execute: async () => ({}) },
    }
    const { registry, requests } = makeRegistry([textTurn("ok")])

    await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools,
      registry,
      logLevel: "silent",
    })

    expect(requests[0]?.tools).toEqual([
      { name: "noop", description: "noop", parameters: expect.anything() },
    ])
  })

  it("turns a thrown tool error into a tool result instead of aborting", async () => {
    const tools: AgentToolSet = {
      boom: {
        description: "always throws",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("tool exploded")
        },
      },
    }
    const { registry } = makeRegistry([toolTurn("boom", {}), textTurn("recovered")])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools,
      registry,
      logLevel: "silent",
    })

    expect(result.turns[0]?.toolResults[0]).toEqual({
      id: "call-boom",
      toolName: "boom",
      result: { error: "tool exploded" },
      isError: true,
    })
    expect(result.text).toBe("recovered")
  })

  it("reports an unknown tool back to the model", async () => {
    const { registry } = makeRegistry([toolTurn("ghost", {}), textTurn("ok")])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools: {},
      registry,
      logLevel: "silent",
    })

    expect(result.turns[0]?.toolResults[0]?.isError).toBe(true)
    expect(result.turns[0]?.toolResults[0]?.result).toEqual({
      error: 'Unknown tool "ghost"',
    })
  })

  it("stops at maxSteps when the model keeps calling tools", async () => {
    const tools: AgentToolSet = {
      loop: { description: "loop", parameters: z.object({}), execute: async () => ({ ok: true }) },
    }
    const { registry, turnCount } = makeRegistry([toolTurn("loop", {})])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools,
      registry,
      maxSteps: 3,
      logLevel: "silent",
    })

    expect(turnCount()).toBe(3)
    expect(result.finishReason).toBe("max-steps")
  })

  it("aggregates usage across turns", async () => {
    const tools: AgentToolSet = {
      step: { description: "step", parameters: z.object({}), execute: async () => ({}) },
    }
    const { registry } = makeRegistry([toolTurn("step", {}), textTurn("done")])

    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools,
      registry,
      logLevel: "silent",
    })

    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 6 })
  })
})

describe("runAgentLoop caching", () => {
  it("caches each inference turn but re-runs tool executions", async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const tools = (): AgentToolSet => ({
      act: { description: "act", parameters: z.object({}), execute },
    })
    const responses = [toolTurn("act", {}), textTurn("done")]

    const first = makeRegistry(responses)
    await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools: tools(),
      registry: first.registry,
      cacheDir: tmpDir,
      logLevel: "silent",
    })
    expect(first.turnCount()).toBe(2)
    expect(execute).toHaveBeenCalledTimes(1)

    const second = makeRegistry(responses)
    const result = await runAgentLoop({
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      tools: tools(),
      registry: second.registry,
      cacheDir: tmpDir,
      logLevel: "silent",
    })

    expect(second.turnCount()).toBe(0)
    expect(result.turns.every((turn) => turn.cacheHit)).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.text).toBe("done")
  })

  it("does not reuse a cached turn when the tool set changes", async () => {
    const responses = [textTurn("done")]
    const base = {
      modelId: "fake:fake-1",
      system: "sys",
      prompt: "go",
      cacheDir: tmpDir,
      logLevel: "silent" as const,
    }

    const first = makeRegistry(responses)
    await runAgentLoop({
      ...base,
      tools: { a: { description: "a", parameters: z.object({}), execute: async () => ({}) } },
      registry: first.registry,
    })

    const second = makeRegistry(responses)
    await runAgentLoop({
      ...base,
      tools: { b: { description: "b", parameters: z.object({}), execute: async () => ({}) } },
      registry: second.registry,
    })

    expect(second.turnCount()).toBe(1)
  })
})

describe("runAgentLoop transparency", () => {
  it("logs one inspectable entry per turn, sharing a correlationId", async () => {
    const tools: AgentToolSet = {
      act: { description: "act", parameters: z.object({}), execute: async () => ({ ok: 1 }) },
    }
    const { registry } = makeRegistry([toolTurn("act", { n: 1 }), textTurn("done")])
    const entries: LlmLogEntry[] = []

    await runAgentLoop({
      modelId: "fake:fake-1",
      system: "system prompt",
      prompt: "user prompt",
      tools,
      registry,
      onLog: (entry) => entries.push(entry),
      log: { taskType: "test-agent", promptName: "test-prompt", pageId: "p1" },
      logLevel: "silent",
    })

    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((e) => e.correlationId)).size).toBe(1)
    expect(entries[0]?.taskType).toBe("test-agent")
    expect(entries[0]?.pageId).toBe("p1")
    expect(entries[0]?.modelId).toBe("fake:fake-1")
    expect(entries[0]?.usage).toEqual({ inputTokens: 1, outputTokens: 2 })

    const firstText = JSON.stringify(entries[0]?.messages)
    expect(firstText).toContain("system prompt")
    expect(firstText).toContain("user prompt")
    expect(firstText).toContain("act")
    expect(JSON.stringify(entries[1]?.messages)).toContain("done")
  })

  it("records a failed turn and rethrows", async () => {
    const module: ProviderModule<{ apiKey?: string }> = {
      manifest: makeManifest({ tools: true, streaming: false }),
      credentialSchema: z.object({ apiKey: z.string().optional() }),
      cacheFingerprint: () => ({ adapterVersion: "fake-1" }),
      createAgentBackend: () => ({
        generateTurn: async () => {
          throw new Error("upstream down")
        },
      }),
    }
    const registry = createProviderRegistry()
      .register(module as AnyProviderModule)
      .freeze()
    const entries: LlmLogEntry[] = []

    await expect(
      runAgentLoop({
        modelId: "fake:fake-1",
        system: "sys",
        prompt: "go",
        tools: {},
        registry,
        onLog: (entry) => entries.push(entry),
        log: { taskType: "test-agent", promptName: "test-prompt" },
        logLevel: "silent",
      }),
    ).rejects.toThrow("upstream down")

    expect(entries).toHaveLength(1)
    expect(entries[0]?.success).toBe(false)
    expect(entries[0]?.validationErrors).toEqual(["upstream down"])
  })
})

describe("runAgentLoop capability gating", () => {
  it("refuses a model that does not declare tool support", async () => {
    const { registry } = makeRegistry([textTurn("done")], {
      tools: false,
      streaming: false,
    })

    await expect(
      runAgentLoop({
        modelId: "fake:fake-1",
        system: "sys",
        prompt: "go",
        tools: {},
        registry,
        logLevel: "silent",
      }),
    ).rejects.toThrow(AiProviderError)
  })
})
