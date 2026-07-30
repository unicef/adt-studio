import { describe, expect, it } from "vitest"
import { resolveEffectiveModelId } from "../client.js"

describe("resolveEffectiveModelId", () => {
  it("keeps a configured model when its provider credential exists", () => {
    expect(resolveEffectiveModelId("anthropic:claude-opus-4-6", {
      anthropicApiKey: "anthropic-key",
    })).toBe("anthropic:claude-opus-4-6")
  })

  it("falls back to the first configured provider", () => {
    expect(resolveEffectiveModelId("openai:gpt-5.4", {
      anthropicApiKey: "anthropic-key",
      googleApiKey: "google-key",
    })).toBe("anthropic:claude-sonnet-4-6")
  })

  it("uses Google when it is the first available provider", () => {
    expect(resolveEffectiveModelId("openai:gpt-5.4", {
      googleApiKey: "google-key",
    })).toBe("google:gemini-2.5-pro")
  })

  it("honors an available user-selected default model", () => {
    expect(resolveEffectiveModelId("openai:gpt-5.4", {
      anthropicApiKey: "anthropic-key",
      googleApiKey: "google-key",
      defaultModelId: "google:gemini-2.5-flash",
    })).toBe("google:gemini-2.5-flash")
  })

  it("uses the selected default instead of a base-config model", () => {
    expect(resolveEffectiveModelId("openai:gpt-5.4", {
      openaiApiKey: "openai-key",
      defaultModelId: "openai:gpt-4.1",
    })).toBe("openai:gpt-4.1")
  })

  it("preserves a model explicitly selected for a step", () => {
    expect(resolveEffectiveModelId("openai:gpt-5.4", {
      openaiApiKey: "openai-key",
      defaultModelId: "openai:gpt-4.1",
      explicitModelIds: { "glossary": "openai:gpt-5.4" },
    }, "glossary")).toBe("openai:gpt-5.4")
  })
})
