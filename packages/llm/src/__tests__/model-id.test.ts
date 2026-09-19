import { describe, expect, it } from "vitest"
import {
  isValidModelId,
  normalizeModelId,
  parseModelId,
  safeParseModelId,
  sanitizeModelIdForPath,
} from "@adt/types"

describe("safeParseModelId", () => {
  it("splits at the first colon and keeps the rest opaque", () => {
    const parsed = parseModelId("ollama:llama3.1:8b")
    expect(parsed.providerId).toBe("ollama")
    expect(parsed.modelId).toBe("llama3.1:8b")
    expect(parsed.qualified).toBe("ollama:llama3.1:8b")
  })

  it("lowercases the provider but preserves model casing", () => {
    const parsed = parseModelId("OpenAI:GPT-5.4-Turbo")
    expect(parsed.providerId).toBe("openai")
    expect(parsed.modelId).toBe("GPT-5.4-Turbo")
  })

  it("allows slashes in the model part", () => {
    expect(parseModelId("custom:meta-llama/Llama-3.3-70B").modelId).toBe(
      "meta-llama/Llama-3.3-70B",
    )
  })

  it("falls back to a default provider for unprefixed ids", () => {
    const parsed = parseModelId("gpt-4o-mini-tts", { defaultProviderId: "openai" })
    expect(parsed.providerId).toBe("openai")
    expect(parsed.modelId).toBe("gpt-4o-mini-tts")
    expect(parsed.usedLegacyDefault).toBe(true)
  })

  it("applies the legacy openai default to an unprefixed id and flags it", () => {
    const parsed = parseModelId("gpt-4o")
    expect(parsed.qualified).toBe("openai:gpt-4o")
    expect(parsed.usedLegacyDefault).toBe(true)
  })

  it("does not flag a prefixed id as legacy", () => {
    expect(parseModelId("openai:gpt-4o").usedLegacyDefault).toBe(false)
  })

  it("rejects an empty provider or model part", () => {
    expect(safeParseModelId(":gpt-4o").ok).toBe(false)
    expect(safeParseModelId("openai:").ok).toBe(false)
    expect(safeParseModelId("   ").ok).toBe(false)
  })

  it("rejects providers with invalid characters", () => {
    expect(isValidModelId("open_ai:gpt-4o")).toBe(false)
    expect(isValidModelId("1openai:gpt-4o")).toBe(false)
    expect(isValidModelId("openai:gpt-4o")).toBe(true)
  })

  it("normalizes only the provider segment", () => {
    expect(normalizeModelId(" Anthropic:Claude-Opus-4 ")).toBe("anthropic:Claude-Opus-4")
  })

  it("produces filesystem-safe folder names without colliding on case", () => {
    expect(sanitizeModelIdForPath("ollama:llama3.1:8b")).toBe("ollama_llama3_1_8b")
    expect(sanitizeModelIdForPath("custom:meta-llama/Llama-3.3")).toBe(
      "custom_meta_llama_llama_3_3",
    )
  })
})
