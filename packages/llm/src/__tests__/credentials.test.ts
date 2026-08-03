import { afterEach, describe, expect, it } from "vitest"
import {
  describeCredentialPresence,
  extractCredentialsFromHeaders,
  isProviderConfiguredOnServer,
  mergeWithServerCredentials,
  providerFieldStatus,
  validateProviderCredentials,
} from "../credentials.js"
import { AiProviderError } from "../ports/errors.js"
import { BUILT_IN_PROVIDERS, createDefaultProviderRegistry } from "../providers/index.js"

const registry = createDefaultProviderRegistry()

function headerReader(headers: Record<string, string>) {
  const lower = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  )
  return (name: string) => lower.get(name.toLowerCase())
}

describe("extractCredentialsFromHeaders", () => {
  it("maps declared headers onto provider field keys", () => {
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({
        "X-OpenAI-Key": "sk-openai",
        "X-Anthropic-API-Key": "sk-ant",
        "X-Custom-Base-URL": "http://localhost:1234/v1",
        "X-Azure-Speech-Region": "brazilsouth",
      }),
    )

    expect(credentials).toEqual({
      openai: { apiKey: "sk-openai" },
      anthropic: { apiKey: "sk-ant" },
      custom: { baseUrl: "http://localhost:1234/v1" },
      azure: { region: "brazilsouth" },
    })
  })

  it("accepts a legacy header when the canonical one is absent", () => {
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({ "X-ADT-OpenAI-Key": "sk-legacy" }),
    )
    expect(credentials.openai).toEqual({ apiKey: "sk-legacy" })
  })

  it("prefers the canonical header over a legacy one", () => {
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({ "X-OpenAI-Key": "sk-new", "X-ADT-OpenAI-Key": "sk-old" }),
    )
    expect(credentials.openai).toEqual({ apiKey: "sk-new" })
  })

  it("ignores blank headers and unknown headers", () => {
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({ "X-OpenAI-Key": "   ", "X-Not-A-Provider": "value" }),
    )
    expect(credentials).toEqual({})
  })

  it("never lets one provider's header populate another provider", () => {
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({ "X-OpenAI-Key": "sk-openai" }),
    )
    expect(credentials.custom).toBeUndefined()
    expect(credentials.anthropic).toBeUndefined()
    expect(credentials.gemini).toBeUndefined()
  })
})

describe("mergeWithServerCredentials", () => {
  const originalKey = process.env.OPENAI_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })

  it("lets a request value override the server env value", () => {
    process.env.OPENAI_API_KEY = "sk-from-env"
    const merged = mergeWithServerCredentials(registry.get("openai"), {
      apiKey: "sk-from-request",
    })
    expect(merged).toEqual({ apiKey: "sk-from-request" })
  })

  it("falls back to the server env value", () => {
    process.env.OPENAI_API_KEY = "sk-from-env"
    expect(mergeWithServerCredentials(registry.get("openai"), undefined)).toEqual({
      apiKey: "sk-from-env",
    })
  })

  it("treats a blank request value as absent", () => {
    process.env.OPENAI_API_KEY = "sk-from-env"
    expect(
      mergeWithServerCredentials(registry.get("openai"), { apiKey: "  " }),
    ).toEqual({ apiKey: "sk-from-env" })
  })
})

describe("validateProviderCredentials", () => {
  it("rejects a missing required field with a localized label and no value", () => {
    try {
      validateProviderCredentials(registry.get("openai"), {})
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("missing-credential")
      expect((error as AiProviderError).message).toContain("API key")
    }
  })

  it("rejects a non-http custom base URL", () => {
    try {
      validateProviderCredentials(registry.get("custom"), {
        baseUrl: "file:///etc/passwd",
      })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("invalid-credential")
    }
  })

  it("rejects a custom base URL with embedded credentials", () => {
    expect(() =>
      validateProviderCredentials(registry.get("custom"), {
        baseUrl: "https://user:pass@example.test/v1",
      }),
    ).toThrow(AiProviderError)
  })

  it("strips the query string from a custom base URL", () => {
    const parsed = validateProviderCredentials<{ baseUrl: string }>(
      registry.get("custom"),
      { baseUrl: "https://example.test/v1?api_key=leak" },
    )
    expect(parsed.baseUrl).toBe("https://example.test/v1")
  })

  it("accepts a custom endpoint with no api key", () => {
    const parsed = validateProviderCredentials<{ baseUrl: string; apiKey: string }>(
      registry.get("custom"),
      { baseUrl: "http://localhost:1234/v1" },
    )
    expect(parsed).toEqual({ baseUrl: "http://localhost:1234/v1", apiKey: "" })
  })

  it("rejects an invalid azure region", () => {
    expect(() =>
      validateProviderCredentials(registry.get("azure"), {
        apiKey: "key",
        region: "brazil south",
      }),
    ).toThrow(AiProviderError)
  })
})

describe("server configuration reporting", () => {
  const original = { ...process.env }

  afterEach(() => {
    for (const key of ["OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it("reports presence per field without exposing values", () => {
    process.env.OPENAI_API_KEY = "sk-secret"
    const status = providerFieldStatus(registry.get("openai"))
    expect(status).toEqual([{ key: "apiKey", configuredOnServer: true }])
    expect(JSON.stringify(status)).not.toContain("sk-secret")
  })

  it("requires every required field before calling a provider configured", () => {
    process.env.AZURE_SPEECH_KEY = "key"
    delete process.env.AZURE_SPEECH_REGION
    expect(isProviderConfiguredOnServer(registry.get("azure"))).toBe(false)

    process.env.AZURE_SPEECH_REGION = "brazilsouth"
    expect(isProviderConfiguredOnServer(registry.get("azure"))).toBe(true)
  })

  it("treats a provider with no required fields as configured", () => {
    expect(isProviderConfiguredOnServer(registry.get("ollama"))).toBe(true)
  })
})

describe("describeCredentialPresence", () => {
  it("summarizes only field keys, never values", () => {
    const summary = describeCredentialPresence(BUILT_IN_PROVIDERS, {
      openai: { apiKey: "sk-secret" },
      custom: { baseUrl: "http://localhost:1234/v1", apiKey: "" },
    })
    expect(summary).toEqual({ openai: ["apiKey"], custom: ["baseUrl"] })
    expect(JSON.stringify(summary)).not.toContain("sk-secret")
    expect(JSON.stringify(summary)).not.toContain("localhost")
  })
})
