import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ollamaProvider, ollamaReasoningEffortFor } from "../providers/ollama/index.js"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function chatCompletion(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 0,
      model: "test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

async function structuredRequestBody(modelId: string): Promise<Record<string, unknown>> {
  fetchMock.mockResolvedValue(chatCompletion('{"title":"t"}'))
  const backend = ollamaProvider.createStructuredTextBackend!({
    providerId: "ollama",
    modelId,
    modality: "structured-text",
    credentials: ollamaProvider.credentialSchema.parse({}),
  })
  await backend.generateStructured({
    messages: [{ role: "user", content: "hi" }],
    schema: z.object({ title: z.string() }),
    strategy: "json-mode",
  })
  return JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
}

describe("ollama reasoning effort", () => {
  it("disables thinking so the token budget goes to the JSON body", async () => {
    const body = await structuredRequestBody("qwen3.5:0.8b")
    expect(body.reasoning_effort).toBe("none")
  })

  it("also applies to non-thinking models, which ignore it", async () => {
    const body = await structuredRequestBody("gemma4:12b")
    expect(body.reasoning_effort).toBe("none")
  })

  it("lowers instead of disabling for levels-only thinking models", async () => {
    const body = await structuredRequestBody("gpt-oss:20b")
    expect(body.reasoning_effort).toBe("low")
  })

  it("maps model families deterministically", () => {
    expect(ollamaReasoningEffortFor("deepseek-r1:8b")).toBe("none")
    expect(ollamaReasoningEffortFor("gpt-oss:120b")).toBe("low")
  })
})
