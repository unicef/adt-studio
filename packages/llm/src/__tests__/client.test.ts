import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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

  it("retries a connect timeout when no signal is aborted", async () => {
    openaiProviderMock.mockReturnValue({ provider: "openai" })
    const onLog = vi.fn()
    generateObjectMock
      .mockRejectedValueOnce(new Error("Cannot connect to API: Connect Timeout Error"))
      .mockResolvedValueOnce({
        object: { ok: true },
        usage: { promptTokens: 1, completionTokens: 1 },
      })

    const llm = createLLMModel({ modelId: "openai:gpt-4.1", onLog })
    const result = await llm.generateObject<{ ok: boolean }>({
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 1,
      log: {
        taskType: "image-meaningfulness",
        pageId: "pg002",
        promptName: "image_meaningfulness",
      },
    })

    expect(result.object).toEqual({ ok: true })
    expect(generateObjectMock).toHaveBeenCalledTimes(2)
    expect(onLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        taskType: "image-meaningfulness",
        pageId: "pg002",
        promptName: "image_meaningfulness",
        modelId: "openai:gpt-4.1",
        cacheHit: false,
        success: false,
        attempt: 0,
        maxAttempts: 2,
        errorClass: "connect-timeout",
        retryable: true,
        retryDelayMs: expect.any(Number),
        finalError: false,
      }),
    )
    expect(onLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        success: true,
        attempt: 1,
        maxAttempts: 2,
      }),
    )
  })

  it("does not retry a non-retryable provider error", async () => {
    openaiProviderMock.mockReturnValue({ provider: "openai" })
    const onLog = vi.fn()
    generateObjectMock.mockRejectedValue(new Error("Invalid API key"))

    const llm = createLLMModel({ modelId: "openai:gpt-4.1", onLog })

    await expect(
      llm.generateObject({
        schema: z.object({ ok: z.boolean() }),
        messages: [{ role: "user", content: "hi" }],
        maxRetries: 1,
        log: {
          taskType: "image-meaningfulness",
          pageId: "pg002",
          promptName: "image_meaningfulness",
        },
      }),
    ).rejects.toThrow("Invalid API key")

    expect(generateObjectMock).toHaveBeenCalledTimes(1)
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        attempt: 0,
        maxAttempts: 2,
        error: "Invalid API key",
        errorClass: "non-retryable",
        retryable: false,
        finalError: true,
      }),
    )
  })

  it("preserves logs and cache across exhausted automatic retries and a manual retry", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-page-retry-cache-"))
    try {
      openaiProviderMock.mockReturnValue({ provider: "openai" })
      generateObjectMock.mockReset()
      generateObjectMock
        .mockRejectedValueOnce(new Error("Cannot connect to API: other side closed"))
        .mockRejectedValueOnce(new Error("Cannot connect to API: other side closed"))
        .mockResolvedValueOnce({
          object: { images: [{ image_id: "pg002_im001", is_meaningful: true }] },
          usage: { promptTokens: 4, completionTokens: 2 },
        })
      const onLog = vi.fn()
      const llm = createLLMModel({
        modelId: "openai:gpt-4.1",
        cacheDir,
        onLog,
      })
      const schema = z.object({
        images: z.array(
          z.object({ image_id: z.string(), is_meaningful: z.boolean() }),
        ),
      })
      const request = {
        schema,
        messages: [{ role: "user" as const, content: "Evaluate pg002" }],
        maxRetries: 1,
        log: {
          taskType: "image-meaningfulness",
          pageId: "pg002",
          promptName: "image_meaningfulness",
        },
      }

      await expect(llm.generateObject(request)).rejects.toThrow("other side closed")
      expect(generateObjectMock).toHaveBeenCalledTimes(2)
      expect(onLog).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          pageId: "pg002",
          success: false,
          attempt: 1,
          maxAttempts: 2,
          errorClass: "connection-closed",
          retryable: true,
          finalError: true,
        }),
      )

      const manualRetry = await llm.generateObject(request)
      expect(manualRetry.object.images).toEqual([
        { image_id: "pg002_im001", is_meaningful: true },
      ])
      expect(generateObjectMock).toHaveBeenCalledTimes(3)
      expect(fs.readdirSync(cacheDir).filter((name) => name.endsWith(".json"))).toHaveLength(1)

      const cachedRetry = await llm.generateObject(request)
      expect(cachedRetry.object).toEqual(manualRetry.object)
      expect(cachedRetry.cached).toBe(true)
      expect(generateObjectMock).toHaveBeenCalledTimes(3)
      expect(onLog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageId: "pg002",
          success: true,
          cacheHit: true,
          attempt: 0,
        }),
      )
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  })
})

describe("createLLMModel validation retries", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("feeds validation errors back to the model before retrying", async () => {
    const validationError =
      "Page mode requires exactly one section, but the response contains 2."

    openaiProviderMock.mockReturnValue({ provider: "openai" })
    generateObjectMock
      .mockResolvedValueOnce({
        object: { sections: [{ id: 1 }, { id: 2 }] },
        usage: { promptTokens: 1, completionTokens: 1 },
      })
      .mockResolvedValueOnce({
        object: { sections: [{ id: 1 }] },
        usage: { promptTokens: 1, completionTokens: 1 },
      })

    const llm = createLLMModel({ modelId: "openai:gpt-4.1" })
    const result = await llm.generateObject<{ sections: Array<{ id: number }> }>({
      schema: z.object({ sections: z.array(z.object({ id: z.number() })) }),
      messages: [{ role: "user", content: "Section this page" }],
      maxRetries: 1,
      validate: (value) => {
        const sections = (value as { sections?: unknown[] }).sections
        return sections?.length === 1
          ? { valid: true, errors: [] }
          : { valid: false, errors: [validationError] }
      },
    })

    expect(result.object.sections).toEqual([{ id: 1 }])
    expect(generateObjectMock).toHaveBeenCalledTimes(2)

    const retryOptions = generateObjectMock.mock.calls[1]?.[0] as {
      messages?: Array<{ role: string; content: string }>
    }
    expect(retryOptions.messages).toEqual([
      { role: "user", content: "Section this page" },
      {
        role: "assistant",
        content: JSON.stringify({ sections: [{ id: 1 }, { id: 2 }] }, null, 2),
      },
      {
        role: "user",
        content: expect.stringContaining(validationError),
      },
    ])
  })
})
