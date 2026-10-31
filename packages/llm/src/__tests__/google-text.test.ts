import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createLLMModel } from "../client.js"
import { googleProvider } from "../providers/google/index.js"
import { createProviderRegistry } from "../registry.js"

const registry = createProviderRegistry().register(googleProvider).freeze()
const providerCredentials = { google: { apiKey: "google-secret" } }
const schema = z.object({ answer: z.string() })
const messages = [{ role: "user" as const, content: "Say hi" }]
const fetchMock = vi.fn<typeof fetch>()

function geminiResponse(text: string) {
  return Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
  })
}

function sentGenerationConfig(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call]![1]!.body as string).generationConfig
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_API_KEY", "")
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "")
  fetchMock.mockReset().mockImplementation(async () => geminiResponse('{"answer":"hi"}'))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("Google text models", () => {
  it.each(["gemini-4-argon", "gemini-4-argon-cyber-permissive"])(
    "sends %s no temperature and no output cap",
    async (model) => {
      const llm = createLLMModel({
        modelId: `google:${model}`, registry, providerCredentials, logLevel: "silent",
      })
      const result = await llm.generateObject<{ answer: string }>({
        schema, messages, temperature: 0.3, maxTokens: 1024,
      })

      expect(result.object).toEqual({ answer: "hi" })
      expect(String(fetchMock.mock.calls[0]![0])).toBe(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      )
      const config = sentGenerationConfig()
      expect(config).not.toHaveProperty("temperature")
      expect(config).not.toHaveProperty("maxOutputTokens")
      expect(
        registry.resolveStructuredText(`google:${model}`, { credentials: providerCredentials })
          .capabilities.temperature,
      ).toBe(false)
    },
  )

  it("never asks Gemini 4 for a long decode this SDK cannot continue", async () => {
    const llm = createLLMModel({
      modelId: "google:gemini-4-argon", registry, providerCredentials, logLevel: "silent",
    })
    await llm.generateObject({ schema, messages, maxTokens: 100_000 })

    expect(sentGenerationConfig()).not.toHaveProperty("maxOutputTokens")
  })

  it("keeps temperature and the caller's cap for earlier Gemini models", async () => {
    const llm = createLLMModel({
      modelId: "google:gemini-2.5-pro", registry, providerCredentials, logLevel: "silent",
    })
    await llm.generateObject({ schema, messages, temperature: 0.3, maxTokens: 1024 })

    const config = sentGenerationConfig()
    expect(config.temperature).toBe(0.3)
    expect(config.maxOutputTokens).toBe(1024)
  })

  it("applies the same limits to Gemini 4 agent turns", async () => {
    fetchMock.mockImplementation(async () => geminiResponse("Done"))
    const { backend } = registry.resolveAgent("google:gemini-4-argon", {
      credentials: providerCredentials,
    })
    const turn = await backend.generateTurn({
      system: "You are a helper.",
      messages: [{ role: "user", content: "Go" }],
      tools: [],
      temperature: 0.3,
      maxTokens: 2048,
    })

    expect(turn.text).toBe("Done")
    const config = sentGenerationConfig()
    expect(config).not.toHaveProperty("temperature")
    expect(config).not.toHaveProperty("maxOutputTokens")
  })
})
