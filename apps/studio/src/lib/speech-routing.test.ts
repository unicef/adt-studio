import { describe, expect, it } from "vitest"
import {
  languageUsesSpeechProvider,
  resolveLocaleMapping,
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
      elevenlabs: {
        languages: ["pt-BR"],
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

  it("resolves ElevenLabs-routed languages", () => {
    expect(resolveSpeechProviderForLanguage("pt-BR", speechConfig)).toBe(
      "elevenlabs"
    )
    expect(languageUsesSpeechProvider("pt-BR", "elevenlabs", speechConfig)).toBe(
      true
    )
    expect(languageUsesSpeechProvider("fr", "elevenlabs", speechConfig)).toBe(
      false
    )
  })
})

describe("resolveLocaleMapping", () => {
  // voices.yaml / speech_instructions.yaml key on lowercase locales, while the
  // UI carries normalizeLocale output with an uppercase region. A case-sensitive
  // lookup fell through to `default`, so the Speech settings screen showed a
  // voice and accent prompt the pipeline would never use.
  const voices = {
    default: "21m00Tcm4TlvDq8ikWAM",
    "es-uy": "QK4xDwo9ESPHA4JNUpX3",
    pt: "SomePortugueseVoice",
  }

  it("matches a lowercase locale key against an uppercase-region code", () => {
    expect(resolveLocaleMapping(voices, "es-UY")).toEqual({
      value: "QK4xDwo9ESPHA4JNUpX3",
      source: "locale",
    })
  })

  it("accepts the underscore form normalizeLocale also handles", () => {
    expect(resolveLocaleMapping(voices, "es_UY").source).toBe("locale")
  })

  it("falls back to the base language before the default", () => {
    expect(resolveLocaleMapping(voices, "pt-BR")).toEqual({
      value: "SomePortugueseVoice",
      source: "base-language",
    })
  })

  it("falls back to the default when neither the locale nor its base matches", () => {
    expect(resolveLocaleMapping(voices, "fr-CA")).toEqual({
      value: "21m00Tcm4TlvDq8ikWAM",
      source: "default",
    })
  })

  it("reports no source when the map has no default and nothing matches", () => {
    expect(resolveLocaleMapping({ "es-uy": "x" }, "fr")).toEqual({
      value: "",
      source: "none",
    })
  })

  it("reports no source for a missing map", () => {
    expect(resolveLocaleMapping(undefined, "es-UY")).toEqual({
      value: "",
      source: "none",
    })
  })

  // Guards against a prototype key ("constructor", "toString") reading as a hit.
  it("only considers the map's own keys", () => {
    expect(resolveLocaleMapping({ default: "d" }, "constructor")).toEqual({
      value: "d",
      source: "default",
    })
  })
})
