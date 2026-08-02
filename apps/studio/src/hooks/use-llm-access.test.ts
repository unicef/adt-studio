import { describe, expect, it } from "vitest"
import { hasCredentialForModel, type LlmCredentialState } from "./use-llm-access"

const none: LlmCredentialState = {
  apiKey: "",
  anthropicKey: "",
  googleKey: "",
  customBaseUrl: "",
}

describe("hasCredentialForModel", () => {
  it("allows local Ollama models without a cloud credential", () => {
    expect(hasCredentialForModel("ollama:gemma4-26b", none)).toBe(true)
  })

  it("requires the credential that matches the selected cloud provider", () => {
    expect(hasCredentialForModel("openai:gpt-5.4", none)).toBe(false)
    expect(hasCredentialForModel("anthropic:claude-sonnet-4-6", { ...none, anthropicKey: "key" })).toBe(true)
    expect(hasCredentialForModel("google:gemini-2.5-pro", { ...none, googleKey: "key" })).toBe(true)
    expect(hasCredentialForModel("custom:model", { ...none, customBaseUrl: "http://localhost" })).toBe(true)
  })
})

