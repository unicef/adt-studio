import { describe, expect, it } from "vitest"
import {
  hasSpeechProviderCredentials,
  languageUsesSpeechProvider,
  resolveSpeechProviderForLanguage,
} from "./speech-routing"

describe("speech-routing", () => {
  const speechConfig = {
    default_provider: "openai",
    providers: {
      gemini: {
        languages: ["en", "hi-IN"],
      },
      azure: {
        languages: ["es"],
      },
    },
  }

  it("resolves exact language matches", () => {
    expect(resolveSpeechProviderForLanguage("hi-IN", speechConfig)).toBe(
      "gemini"
    )
  })

  it("resolves base language matches", () => {
    expect(resolveSpeechProviderForLanguage("en-US", speechConfig)).toBe(
      "gemini"
    )
    expect(resolveSpeechProviderForLanguage("es-MX", speechConfig)).toBe(
      "azure"
    )
  })

  it("falls back to the default provider", () => {
    expect(resolveSpeechProviderForLanguage("fr", speechConfig)).toBe("openai")
  })

  it("detects whether a language uses Gemini", () => {
    expect(languageUsesSpeechProvider("en-GB", "gemini", speechConfig)).toBe(
      true
    )
    expect(languageUsesSpeechProvider("fr", "gemini", speechConfig)).toBe(
      false
    )
  })

  it("requires the complete credential set for each speech provider", () => {
    expect(hasSpeechProviderCredentials("openai", { openaiKey: "key" })).toBe(true)
    expect(hasSpeechProviderCredentials("gemini", { geminiKey: "key" })).toBe(true)
    expect(hasSpeechProviderCredentials("azure", { azureKey: "key" })).toBe(false)
    expect(hasSpeechProviderCredentials("azure", {
      azureKey: "key",
      azureRegion: "eastus",
    })).toBe(true)
    expect(hasSpeechProviderCredentials("unknown", { openaiKey: "key" })).toBe(false)
  })
})
