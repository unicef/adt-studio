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
})

describe("createLLMModel cancellation", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("combines the external signal into the request abort signal", async () => {
    openaiProviderMock.mockReturnValue({ provider: "openai" })
    let captured: AbortSignal | undefined
    generateObjectMock.mockImplementation((opts: { abortSignal?: AbortSignal }) => {
      captured = opts.abortSignal
      return Promise.resolve({
        object: { ok: true },
        usage: { promptTokens: 1, completionTokens: 1 },
      })
    })

    const controller = new AbortController()
    const llm = createLLMModel({ modelId: "openai:gpt-4.1", signal: controller.signal })
    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hi" }],
    })

    expect(captured).toBeInstanceOf(AbortSignal)
    expect(captured?.aborted).toBe(false)
    // Aborting the external signal aborts the combined request signal.
    controller.abort()
    expect(captured?.aborted).toBe(true)
  })

  it("does not retry when the external signal is aborted", async () => {
    openaiProviderMock.mockReturnValue({ provider: "openai" })
    generateObjectMock.mockRejectedValue(new Error("aborted"))

    const controller = new AbortController()
    controller.abort()
    const llm = createLLMModel({ modelId: "openai:gpt-4.1", signal: controller.signal })

    await expect(
      llm.generateObject({
        schema: z.object({ ok: z.boolean() }),
        messages: [{ role: "user", content: "hi" }],
        maxRetries: 5,
      }),
    ).rejects.toThrow()
    // Cancelled: exactly one attempt, no retries despite maxRetries: 5.
    expect(generateObjectMock).toHaveBeenCalledTimes(1)
  })

  it("still retries a normal failure when no signal is aborted", async () => {
    openaiProviderMock.mockReturnValue({ provider: "openai" })
    generateObjectMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        object: { ok: true },
        usage: { promptTokens: 1, completionTokens: 1 },
      })

    const llm = createLLMModel({ modelId: "openai:gpt-4.1" })
    const result = await llm.generateObject<{ ok: boolean }>({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 1,
    })

    expect(result.object).toEqual({ ok: true })
    expect(generateObjectMock).toHaveBeenCalledTimes(2)
  })
})
