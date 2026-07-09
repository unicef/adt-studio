import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createLLMModel } from "../client.js"

const {
  generateObjectMock,
  openaiProviderMock,
  createOpenAIMock,
  anthropicProviderMock,
  createAnthropicMock,
  googleProviderMock,
  createGoogleGenerativeAIMock,
} = vi.hoisted(() => {
  return {
    generateObjectMock: vi.fn(),
    openaiProviderMock: vi.fn(),
    createOpenAIMock: vi.fn(),
    anthropicProviderMock: vi.fn(),
    createAnthropicMock: vi.fn(),
    googleProviderMock: vi.fn(),
    createGoogleGenerativeAIMock: vi.fn(),
  }
})

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
  APICallError: { isInstance: () => false },
  NoObjectGeneratedError: { isInstance: () => false },
}))

vi.mock("@ai-sdk/openai", () => ({
  openai: openaiProviderMock,
  createOpenAI: createOpenAIMock,
}))

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: anthropicProviderMock,
  createAnthropic: createAnthropicMock,
}))

vi.mock("@ai-sdk/google", () => ({
  google: googleProviderMock,
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}))

describe("createLLMModel credentials", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses a request-scoped OpenAI client when openaiApiKey is provided", async () => {
    const requestScopedModel = { provider: "request-openai" }
    const defaultModel = { provider: "default-openai" }

    openaiProviderMock.mockReturnValue(defaultModel)
    createOpenAIMock.mockReturnValue(vi.fn(() => requestScopedModel))
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const llm = createLLMModel({
      modelId: "openai:gpt-4.1",
      credentials: { openaiApiKey: "sk-request" },
    })

    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hello" }],
    })

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-request" })
    expect(openaiProviderMock).not.toHaveBeenCalled()
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: requestScopedModel }),
    )
  })

  it("falls back to the default provider client when no request-scoped key is provided", async () => {
    const defaultModel = { provider: "default-openai" }

    openaiProviderMock.mockReturnValue(defaultModel)
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const llm = createLLMModel({
      modelId: "openai:gpt-4.1",
    })

    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hello" }],
    })

    expect(createOpenAIMock).not.toHaveBeenCalled()
    expect(openaiProviderMock).toHaveBeenCalled()
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: defaultModel }),
    )
  })

  it("supports request-scoped Anthropic and Google credentials", async () => {
    const anthropicModel = { provider: "request-anthropic" }
    const googleModel = { provider: "request-google" }

    createAnthropicMock.mockReturnValue(vi.fn(() => anthropicModel))
    createGoogleGenerativeAIMock.mockReturnValue(vi.fn(() => googleModel))
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const anthropicLlm = createLLMModel({
      modelId: "anthropic:claude-3-5-sonnet-latest",
      credentials: { anthropicApiKey: "ak-request" },
    })
    await anthropicLlm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hello" }],
    })

    const googleLlm = createLLMModel({
      modelId: "google:gemini-2.5-flash",
      credentials: { googleApiKey: "gk-request" },
    })
    await googleLlm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hello" }],
    })

    expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: "ak-request" })
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({ apiKey: "gk-request" })
    expect(generateObjectMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: anthropicModel }),
    )
    expect(generateObjectMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: googleModel }),
    )
  })

  it("uses tool mode for Anthropic callers that request JSON mode", async () => {
    const anthropicModel = { provider: "request-anthropic" }
    createAnthropicMock.mockReturnValue(vi.fn(() => anthropicModel))
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const llm = createLLMModel({
      modelId: "anthropic:claude-sonnet-4-6",
      credentials: { anthropicApiKey: "ak-request" },
      logLevel: "silent",
    })
    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      mode: "json",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: anthropicModel, mode: "tool" }),
    )
  })
})
