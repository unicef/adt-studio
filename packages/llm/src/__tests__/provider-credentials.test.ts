import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AiProviderError } from "../ports/errors.js"

const { createOpenAIMock, createAnthropicMock, createGoogleMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  createAnthropicMock: vi.fn(),
  createGoogleMock: vi.fn(),
}))

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: createOpenAIMock }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: createAnthropicMock }))
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: createGoogleMock }))

const { createDefaultProviderRegistry } = await import("../providers/index.js")

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "CUSTOM_OPENAI_BASE_URL",
  "CUSTOM_OPENAI_API_KEY",
  "OLLAMA_BASE_URL",
]

describe("built-in provider credential isolation", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    createOpenAIMock.mockReturnValue(vi.fn(() => ({ id: "openai-model" })))
    createAnthropicMock.mockReturnValue(vi.fn(() => ({ id: "anthropic-model" })))
    createGoogleMock.mockReturnValue(vi.fn(() => ({ id: "google-model" })))
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    vi.clearAllMocks()
  })

  it("authenticates each provider with its own key only", () => {
    const registry = createDefaultProviderRegistry()
    const credentials = {
      openai: { apiKey: "sk-openai" },
      anthropic: { apiKey: "ak-anthropic" },
      google: { apiKey: "gk-google" },
    }

    registry.resolveStructuredText("openai:gpt-4.1", { credentials })
    registry.resolveStructuredText("anthropic:claude-3-5-sonnet-latest", { credentials })
    registry.resolveStructuredText("google:gemini-2.5-flash", { credentials })

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-openai" })
    expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: "ak-anthropic" })
    expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: "gk-google" })
  })

  it("does not fall back to another provider's key", () => {
    const registry = createDefaultProviderRegistry()

    expect(() =>
      registry.resolveStructuredText("anthropic:claude-3-5-sonnet-latest", {
        credentials: { openai: { apiKey: "sk-openai" } },
      }),
    ).toThrow(AiProviderError)
    expect(createAnthropicMock).not.toHaveBeenCalled()
  })

  it("sends the custom endpoint's own key and never OpenAI's", () => {
    const registry = createDefaultProviderRegistry()

    registry.resolveStructuredText("custom:local-model", {
      credentials: {
        openai: { apiKey: "sk-openai" },
        custom: { baseUrl: "http://localhost:1234/v1", apiKey: "local-key" },
      },
    })

    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:1234/v1", apiKey: "local-key" }),
    )
    expect(createOpenAIMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-openai" }),
    )
  })
})

describe("agent tool capability gate", () => {
  beforeEach(() => {
    createOpenAIMock.mockReturnValue(vi.fn(() => ({ id: "model" })))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("allows a custom model that declares tool support", () => {
    const registry = createDefaultProviderRegistry()
    const resolved = registry.resolveAgent("custom:qwen2.5-32b-instruct", {
      credentials: { custom: { baseUrl: "http://localhost:1234/v1" } },
    })

    expect(resolved.capabilities.tools).toBe(true)
  })

  it("rejects a custom model with no declared tool support", () => {
    const registry = createDefaultProviderRegistry()

    expect(() =>
      registry.resolveAgent("custom:some-unknown-base-model", {
        credentials: { custom: { baseUrl: "http://localhost:1234/v1" } },
      }),
    ).toThrow(/does not support "tools"/)
  })
})
