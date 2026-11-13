import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createLLMModel } from "../client.js"
import { anthropicProvider } from "../providers/anthropic/index.js"
import { claudeModelRules } from "../providers/anthropic/claude-models.js"
import { ModelRefusalError } from "../ports/errors.js"
import { createProviderRegistry } from "../registry.js"

const registry = createProviderRegistry().register(anthropicProvider).freeze()
const providerCredentials = { anthropic: { apiKey: "sk-ant-test" } }
const schema = z.object({ answer: z.string() })
const messages = [{ role: "user" as const, content: "Say hi" }]
const fetchMock = vi.fn<typeof fetch>()

type ContentBlock = Record<string, unknown>

function claudeResponse(content: ContentBlock[], stopReason = "tool_use") {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content,
    stop_reason: stopReason,
    usage: { input_tokens: 3, output_tokens: 2 },
  })
}

const thinking: ContentBlock = { type: "thinking", thinking: "", signature: "sig" }
const jsonToolCall: ContentBlock = {
  type: "tool_use",
  id: "toolu_1",
  name: "json",
  input: { answer: "hi" },
}

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call]![1]!.body as string)
}

function generate(model: string, options: { system?: string; maxRetries?: number } = {}) {
  const llm = createLLMModel({
    modelId: `anthropic:${model}`, registry, providerCredentials, logLevel: "silent",
  })
  return llm.generateObject<{ answer: string }>({
    schema, messages, temperature: 0.3, maxTokens: 1024, ...options,
  })
}

function temperatureCapability(model: string): boolean {
  return registry.resolveStructuredText(`anthropic:${model}`, { credentials: providerCredentials })
    .capabilities.temperature
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "")
  fetchMock.mockReset().mockImplementation(async () => claudeResponse([thinking, jsonToolCall]))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("claudeModelRules", () => {
  it.each([
    ["claude-fable-5-1", true, true, true],
    ["claude-opus-5-5", true, true, true],
    ["claude-sonnet-5-5", true, true, true],
    ["claude-haiku-5-5", true, true, false],
    ["claude-fable-5", true, true, false],
    ["claude-opus-5", true, true, false],
    ["claude-sonnet-5", true, true, false],
    ["claude-opus-4-8", true, false, false],
    ["claude-opus-4-7", true, false, false],
    ["claude-opus-4-6", false, false, false],
    ["claude-sonnet-4-6", false, false, false],
    ["claude-haiku-4-5", false, false, false],
    ["claude-opus-4-1-20250805", false, false, false],
    ["claude-opus-4-20250514", false, false, false],
    ["claude-3-7-sonnet-20250219", false, false, false],
    ["claude-instant-1.2", false, false, false],
    ["claude-mythos-preview", true, true, true],
    ["claude-newfamily-1", true, true, true],
  ])("%s", (model, rejectsSampling, thinksByDefault, rejectsForcedToolChoice) => {
    expect(claudeModelRules(model)).toEqual({
      rejectsSampling,
      thinksByDefault,
      rejectsForcedToolChoice,
    })
  })
})

describe("Anthropic text models", () => {
  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"])(
    "asks %s for the json tool without forcing it",
    async (model) => {
      const result = await generate(model, { system: "You are terse." })

      expect(result.object).toEqual({ answer: "hi" })
      expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.anthropic.com/v1/messages")
      const body = sentBody()
      expect(body.model).toBe(model)
      expect(body.tool_choice).toEqual({ type: "auto" })
      expect(body.tools).toEqual([expect.objectContaining({ name: "json" })])
      expect(body.system).toEqual([
        {
          type: "text",
          text: expect.stringMatching(/^You are terse\.\n\n.*calling the `json` tool/s),
        },
      ])
      expect(body).not.toHaveProperty("temperature")
      expect(body).not.toHaveProperty("top_p")
      expect(body).not.toHaveProperty("top_k")
      expect(body).not.toHaveProperty("thinking")
      expect(body.max_tokens).toBe(1024 + 16_384)
      expect(temperatureCapability(model)).toBe(false)
    },
  )

  it("logs the steering line as part of the system prompt the model saw", async () => {
    const onLog = vi.fn()
    const llm = createLLMModel({
      modelId: "anthropic:claude-opus-5-5", registry, providerCredentials, logLevel: "silent", onLog,
    })
    await llm.generateObject({
      schema, messages, system: "You are terse.", log: { taskType: "test", promptName: "p" },
    })

    const sent = (sentBody().system as Array<{ text: string }>)[0]!.text
    expect(sent).toContain("calling the `json` tool")
    expect(onLog).toHaveBeenCalledTimes(1)
    expect(onLog.mock.calls[0]![0].messages[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: sent }],
    })
  })

  it("reports the steering line as a system addition, and none where the call is forced", () => {
    const request = { system: "You are terse.", messages, schema, strategy: "tool-call" as const }
    const backendFor = (model: string) =>
      registry.resolveStructuredText(`anthropic:${model}`, { credentials: providerCredentials })
        .backend
    expect(backendFor("claude-opus-5-5").systemAdditions?.(request)).toEqual([
      expect.stringContaining("calling the `json` tool"),
    ])
    expect(backendFor("claude-haiku-5-5").systemAdditions?.(request)).toEqual([])
    expect(backendFor("claude-opus-4-6").systemAdditions?.(request)).toEqual([])
  })

  it("accepts a JSON answer written as text when the tool goes uncalled", async () => {
    fetchMock.mockImplementation(async () =>
      claudeResponse([thinking, { type: "text", text: '```json\n{"answer":"hi"}\n```' }], "end_turn"),
    )

    const result = await generate("claude-opus-5-5")

    expect(result.object).toEqual({ answer: "hi" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(["claude-haiku-5-5", "claude-opus-4-6"])(
    "reports a safety decline from %s once, without retrying it",
    async (model) => {
      fetchMock.mockImplementation(async () =>
        Response.json({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model,
          content: [],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: "cyber", explanation: "Exploit development." },
          usage: { input_tokens: 3, output_tokens: 0 },
        }),
      )

      const failure = generate(model, { maxRetries: 3 })

      await expect(failure).rejects.toThrow(ModelRefusalError)
      await expect(failure).rejects.toThrow(
        "Claude declined this request (cyber): Exploit development.",
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it("doesn't take a JSON answer from a reply cut off at max_tokens", async () => {
    fetchMock.mockImplementation(async () =>
      claudeResponse(
        [{ type: "text", text: '{"answer":"draft"} and then {"answer": "fin' }],
        "max_tokens",
      ),
    )

    await expect(generate("claude-opus-5-5")).rejects.toThrow("the tool was not called")
  })

  it.each(["structured-text", "agent"] as const)(
    "gives thinking models at least five minutes per %s request",
    async (modality) => {
      const timeout = vi.spyOn(AbortSignal, "timeout")
      if (modality === "structured-text") {
        const { backend } = registry.resolveStructuredText("anthropic:claude-opus-5-5", {
          credentials: providerCredentials,
        })
        await backend.generateStructured({
          schema, messages, strategy: "tool-call", timeoutMs: 90_000,
        })
      } else {
        fetchMock.mockImplementation(async () => claudeResponse([{ type: "text", text: "Done" }]))
        const { backend } = registry.resolveAgent("anthropic:claude-opus-5-5", {
          credentials: providerCredentials,
        })
        await backend.generateTurn({
          system: "", messages: [{ role: "user", content: "Go" }], tools: [], timeoutMs: 90_000,
        })
      }

      expect(timeout).toHaveBeenCalledWith(300_000)
      timeout.mockRestore()
    },
  )

  it("keeps Haiku 5.5's forced tool call, without sampling and with thinking room", async () => {
    await generate("claude-haiku-5-5")

    const body = sentBody()
    expect(body.tool_choice).toEqual({ type: "tool", name: "json" })
    expect(body).not.toHaveProperty("temperature")
    expect(body.max_tokens).toBe(1024 + 16_384)
    expect(temperatureCapability("claude-haiku-5-5")).toBe(false)
  })

  it("never asks for more than the 128K output ceiling", async () => {
    const llm = createLLMModel({
      modelId: "anthropic:claude-opus-5-5", registry, providerCredentials, logLevel: "silent",
    })
    await llm.generateObject({ schema, messages, maxTokens: 120_000 })

    expect(sentBody().max_tokens).toBe(128_000)
  })

  it("drops sampling on Opus 4.8 but keeps its cap and forced tool call", async () => {
    await generate("claude-opus-4-8")

    const body = sentBody()
    expect(body).not.toHaveProperty("temperature")
    expect(body.max_tokens).toBe(1024)
    expect(body.tool_choice).toEqual({ type: "tool", name: "json" })
  })

  it("leaves requests to earlier models unchanged", async () => {
    await generate("claude-opus-4-6", { system: "You are terse." })

    const body = sentBody()
    expect(body.system).toEqual([{ type: "text", text: "You are terse." }])
    expect(body.temperature).toBe(0.3)
    expect(body.max_tokens).toBe(1024)
    expect(body.tool_choice).toEqual({ type: "tool", name: "json" })
    expect(temperatureCapability("claude-opus-4-6")).toBe(true)
  })

  it("applies the same limits to Opus 5.5 agent turns", async () => {
    fetchMock.mockImplementation(async () =>
      claudeResponse([thinking, { type: "text", text: "Done" }], "end_turn"),
    )
    const { backend } = registry.resolveAgent("anthropic:claude-opus-5-5", {
      credentials: providerCredentials,
    })
    const turn = await backend.generateTurn({
      system: "You are a helper.",
      messages: [{ role: "user", content: "Go" }],
      tools: [
        {
          name: "lookup",
          description: "Look something up.",
          parameters: z.object({ query: z.string() }),
        },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    })

    expect(turn.text).toBe("Done")
    const body = sentBody()
    expect(body).not.toHaveProperty("temperature")
    expect(body.tool_choice).toEqual({ type: "auto" })
    expect(body.max_tokens).toBe(2048 + 16_384)
  })
})
