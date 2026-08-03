import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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
    delete process.env.LOCAL_LLM_OPENAI_BASE_URL
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

  it("maps stable Gemma aliases to the local Ollama OpenAI endpoint", async () => {
    const ollamaModel = { provider: "ollama" }
    const ollamaProvider = vi.fn(() => ollamaModel)
    createOpenAIMock.mockReturnValue(ollamaProvider)
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const llm = createLLMModel({ modelId: "ollama:gemma4-26b" })
    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hello" }],
    })

    expect(createOpenAIMock).toHaveBeenCalledWith({
      baseURL: "http://127.0.0.1:11434/v1",
      apiKey: "ollama",
    })
    expect(ollamaProvider).toHaveBeenCalledWith("gemma4:26b", { structuredOutputs: false })
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: ollamaModel,
        mode: "json",
        providerOptions: { openai: { reasoningEffort: "none" } },
      }),
    )
  })

  it("enables provider-enforced schemas for local auto mode", async () => {
    process.env.LOCAL_LLM_OPENAI_BASE_URL = "http://127.0.0.1:3133/api/local-ai/openai/v1"
    const localModel = { provider: "local" }
    const localProvider = vi.fn(() => localModel)
    createOpenAIMock.mockReturnValue(localProvider)
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { promptTokens: 1, completionTokens: 2 },
    })

    const llm = createLLMModel({ modelId: "local:gemma4-12b" })
    await llm.generateObject({
      schema: z.object({ ok: z.boolean() }),
      mode: "auto",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(localProvider).toHaveBeenCalledWith("gemma4-12b", {
      structuredOutputs: true,
    })
  })

  it("schema-validates recovered local JSON before custom validation", async () => {
    const ollamaModel = { provider: "ollama" }
    createOpenAIMock.mockReturnValue(vi.fn(() => ollamaModel))
    generateObjectMock
      .mockResolvedValueOnce({
        object: { type: "object", properties: {} },
        usage: { promptTokens: 1, completionTokens: 2 },
      })
      .mockResolvedValueOnce({
        object: { images: [] },
        usage: { promptTokens: 1, completionTokens: 2 },
      })

    const customValidate = vi.fn(() => ({ valid: true, errors: [] }))
    const llm = createLLMModel({ modelId: "ollama:gemma4-26b" })
    const result = await llm.generateObject<{ images: unknown[] }>({
      schema: z.object({ images: z.array(z.unknown()) }),
      messages: [{ role: "user", content: "hello" }],
      validate: customValidate,
      maxRetries: 1,
    })

    expect(result.object).toEqual({ images: [] })
    expect(generateObjectMock).toHaveBeenCalledTimes(2)
    expect(customValidate).toHaveBeenCalledTimes(1)
  })

  it("caches the accepted retry under the original request", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-llm-retry-cache-"))
    try {
      openaiProviderMock.mockReturnValue({ provider: "openai" })
      generateObjectMock
        .mockResolvedValueOnce({
          object: { wrong: true },
          usage: { promptTokens: 1, completionTokens: 1 },
        })
        .mockResolvedValueOnce({
          object: { ok: true },
          usage: { promptTokens: 1, completionTokens: 1 },
        })

      const llm = createLLMModel({ modelId: "openai:gpt-4.1", cacheDir })
      const request = {
        schema: z.object({ ok: z.boolean() }),
        messages: [{ role: "user" as const, content: "hello" }],
        maxRetries: 1,
      }

      expect((await llm.generateObject(request)).object).toEqual({ ok: true })
      expect((await llm.generateObject(request)).object).toEqual({ ok: true })
      expect(generateObjectMock).toHaveBeenCalledTimes(2)
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true })
    }
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
