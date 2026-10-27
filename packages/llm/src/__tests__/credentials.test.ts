import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
  describeCredentialPresence,
  extractCredentialsFromHeaders,
  isProviderConfiguredOnServer,
  mergeWithServerCredentials,
  providerFieldStatus,
  resolveCredentialValues,
  resolveProviderCredentials,
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

  it("does not borrow a shared provider's header at extraction time", () => {
    // The fallback lives in resolveCredentialValues, where the server's own
    // key can still take precedence; the headers map stays one-to-one.
    const credentials = extractCredentialsFromHeaders(
      BUILT_IN_PROVIDERS,
      headerReader({ "X-Google-API-Key": "AIza-shared" }),
    )
    expect(credentials.google).toEqual({ apiKey: "AIza-shared" })
    expect(credentials.gemini).toBeUndefined()
  })
})

describe("shared credentials (sharedWith)", () => {
  const original = { ...process.env }
  const gemini = () => registry.get("gemini")
  const envKeys = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]

  const clearEnv = () => {
    for (const key of envKeys) delete process.env[key]
  }

  afterEach(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it("falls back to the shared provider's request header", () => {
    clearEnv()
    expect(
      resolveCredentialValues(gemini(), { google: { apiKey: "AIza-google" } }, registry.tryGet),
    ).toEqual({ apiKey: "AIza-google" })
  })

  it("prefers the provider's own request header over the shared one", () => {
    clearEnv()
    expect(
      resolveCredentialValues(
        gemini(),
        { google: { apiKey: "AIza-google" }, gemini: { apiKey: "AIza-gemini" } },
        registry.tryGet,
      ),
    ).toEqual({ apiKey: "AIza-gemini" })
  })

  it("prefers the provider's own server key over a shared request header", () => {
    clearEnv()
    process.env.GEMINI_API_KEY = "AIza-server-gemini"
    expect(
      resolveCredentialValues(gemini(), { google: { apiKey: "AIza-google" } }, registry.tryGet),
    ).toEqual({ apiKey: "AIza-server-gemini" })
  })

  it("prefers the provider's own server key over the shared provider's", () => {
    clearEnv()
    process.env.GOOGLE_API_KEY = "AIza-server-google"
    process.env.GEMINI_API_KEY = "AIza-server-gemini"
    expect(resolveCredentialValues(gemini(), {}, registry.tryGet)).toEqual({
      apiKey: "AIza-server-gemini",
    })
  })

  it("falls back to the shared provider's server key last", () => {
    clearEnv()
    process.env.GOOGLE_API_KEY = "AIza-server-google"
    expect(resolveCredentialValues(gemini(), {}, registry.tryGet)).toEqual({
      apiKey: "AIza-server-google",
    })
    // A shared request header still beats the shared server key.
    expect(
      resolveCredentialValues(gemini(), { google: { apiKey: "AIza-google" } }, registry.tryGet),
    ).toEqual({ apiKey: "AIza-google" })
  })

  it("cannot reach the shared server key without a provider lookup", () => {
    clearEnv()
    process.env.GOOGLE_API_KEY = "AIza-server-google"
    expect(resolveCredentialValues(gemini(), {})).toEqual({})
    expect(() => resolveProviderCredentials(gemini(), {})).toThrow(AiProviderError)
  })

  it("counts the shared provider's server key as configuring the provider", () => {
    clearEnv()
    process.env.GOOGLE_API_KEY = "AIza-server-google"
    expect(isProviderConfiguredOnServer(gemini(), registry.tryGet)).toBe(true)
    expect(providerFieldStatus(gemini(), registry.tryGet)).toEqual([
      { key: "apiKey", configuredOnServer: true },
    ])
    expect(isProviderConfiguredOnServer(gemini())).toBe(false)
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

describe("CLI provider billing boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("never adopts an ambient ANTHROPIC_API_KEY for claude-agent", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-ambient")
    vi.stubEnv("CLAUDE_AGENT_API_KEY", "")

    expect(mergeWithServerCredentials(registry.get("claude-agent"), undefined)).toEqual({})
    expect(providerFieldStatus(registry.get("claude-agent"))).toEqual([
      { key: "apiKey", configuredOnServer: false },
    ])
  })

  it("bills claude-agent only to its dedicated CLAUDE_AGENT_API_KEY", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-ambient")
    vi.stubEnv("CLAUDE_AGENT_API_KEY", "sk-ant-dedicated")

    expect(mergeWithServerCredentials(registry.get("claude-agent"), undefined)).toEqual({
      apiKey: "sk-ant-dedicated",
    })
  })

  it("never adopts an ambient OPENAI_API_KEY for codex", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-ambient")
    vi.stubEnv("CODEX_API_KEY", "")

    expect(mergeWithServerCredentials(registry.get("codex"), undefined)).toEqual({})
    expect(providerFieldStatus(registry.get("codex"))).toEqual([
      { key: "apiKey", configuredOnServer: false },
    ])
  })

  it("bills codex only to its dedicated CODEX_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-ambient")
    vi.stubEnv("CODEX_API_KEY", "sk-dedicated")

    expect(mergeWithServerCredentials(registry.get("codex"), undefined)).toEqual({
      apiKey: "sk-dedicated",
    })
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

  it("reports only the path and issue code for an invalid credential", () => {
    const received = "credential-value-that-must-not-leak"
    const module = {
      ...registry.get("custom"),
      credentialSchema: z.object({
        baseUrl: z.enum(["https://allowed.example/v1"]),
      }),
    }

    try {
      validateProviderCredentials(module, { baseUrl: received })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).message).toContain("baseUrl: invalid_enum_value")
      expect((error as AiProviderError).message).not.toContain(received)
    }
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
