import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ModelDiscoveryResponse, ProviderHealthResponse, ProvidersResponse } from "@adt/types"
import { createProviderRoutes } from "./providers.js"

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-providers-"))
  configPath = path.join(tmpDir, "config.yaml")
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function getProviders(): Promise<ProvidersResponse> {
  const app = createProviderRoutes(configPath)
  const response = await app.request("/providers")
  expect(response.status).toBe(200)
  return ProvidersResponse.parse(await response.json())
}

describe("GET /providers", () => {
  it("returns a Zod-valid payload for every registered provider", async () => {
    const body = await getProviders()
    expect(body.providers.map((p) => p.manifest.id)).toEqual([
      "openai",
      "anthropic",
      "claude-agent",
      "codex",
      "google",
      "custom",
      "ollama",
      "azure",
      "elevenlabs",
      "gemini",
    ])
  })

  it("reports per-field server configuration without any credential value", async () => {
    process.env.OPENAI_API_KEY = "sk-do-not-leak"
    try {
      const app = createProviderRoutes(configPath)
      const response = await app.request("/providers")
      const text = await response.text()

      expect(text).not.toContain("sk-do-not-leak")

      const body = ProvidersResponse.parse(JSON.parse(text))
      const openai = body.providers.find((p) => p.manifest.id === "openai")!
      expect(openai.configuredOnServer).toBe(true)
      expect(openai.fieldStatus).toEqual([{ key: "apiKey", configuredOnServer: true }])
    } finally {
      delete process.env.OPENAI_API_KEY
    }
  })

  it("never serializes a runtime factory", async () => {
    const app = createProviderRoutes(configPath)
    const text = await (await app.request("/providers")).text()
    expect(text).not.toContain("createStructuredTextBackend")
    expect(text).not.toContain("cacheFingerprint")
  })

  it("falls back to built-in defaults when config.yaml is absent", async () => {
    const body = await getProviders()
    expect(body.defaults["structured-text"]).toBe("openai:gpt-5.4")
    expect(body.defaults.image).toBe("openai:gpt-image-2")
    expect(body.defaults.tts).toBe("openai:gpt-4o-mini-tts")
    expect(body.defaults.stt).toBe("openai:whisper-1")
  })

  it("qualifies configured defaults and prefers the agents model for agents", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "default_model: anthropic:claude-opus-4",
        "agents:",
        "  model: google:gemini-2.5-pro",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults["structured-text"]).toBe("anthropic:claude-opus-4")
    expect(body.defaults.agent).toBe("google:gemini-2.5-pro")
  })

  it("tolerates a malformed config.yaml instead of failing the request", async () => {
    fs.writeFileSync(
      configPath,
      "structure_types: {}\nrole_types: {}\ndefault_model: [not, a, string]\n",
      "utf-8",
    )
    const body = await getProviders()
    expect(body.defaults["structured-text"]).toBe("openai:gpt-5.4")
  })

  it("exposes localized labels for every supported locale", async () => {
    const body = await getProviders()
    for (const provider of body.providers) {
      for (const field of provider.manifest.credentialFields) {
        expect(Object.keys(field.label).sort()).toEqual(
          ["en", "es", "fr", "pt-BR", "sq"].sort(),
        )
      }
    }
  })
})

describe("GET /providers/:id/models", () => {
  it("returns 404 for an unknown provider", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/nope/models")
    expect(response.status).toBe(404)
  })

  it("returns 400 for an invalid modality", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/openai/models?modality=bogus")
    expect(response.status).toBe(400)
  })

  it("degrades to missing-credential when no key is provided", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/openai/models")
    expect(response.status).toBe(200)
    const body = ModelDiscoveryResponse.parse(await response.json())
    expect(body.providerId).toBe("openai")
    expect(body.supported).toBe(false)
    expect(body.error).toBe("missing-credential")
    expect(body.models).toEqual([])
  })

  it("reports unsupported for a provider without a model catalogue", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/azure/models")
    expect(response.status).toBe(200)
    const body = ModelDiscoveryResponse.parse(await response.json())
    expect(body.supported).toBe(false)
    expect(body.error).toBe("unsupported")
  })
})

describe("GET /providers/:id/health", () => {
  async function getHealth(
    providerId: string,
    headers?: Record<string, string>,
  ): Promise<ProviderHealthResponse> {
    const app = createProviderRoutes(configPath)
    const response = await app.request(`/providers/${providerId}/health`, { headers })
    expect(response.status).toBe(200)
    return ProviderHealthResponse.parse(await response.json())
  }

  it("returns 404 for an unknown provider", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/nope/health")
    expect(response.status).toBe(404)
  })

  it("reports a missing credential instead of contacting the provider", async () => {
    const body = await getHealth("openai")
    expect(body.providerId).toBe("openai")
    expect(body.ok).toBe(false)
    expect(body.code).toBe("missing-credential")
  })

  it("reports configured for a provider with no live probe", async () => {
    const body = await getHealth("azure", {
      "X-Azure-Speech-Key": "azure-key",
      "X-Azure-Speech-Region": "westeurope",
    })
    expect(body).toEqual({ providerId: "azure", ok: true, code: "configured" })
  })

  it("never echoes a submitted credential", async () => {
    const app = createProviderRoutes(configPath)
    const response = await app.request("/providers/openai/health", {
      headers: { "X-OpenAI-Key": "sk-do-not-leak" },
    })
    expect(await response.text()).not.toContain("sk-do-not-leak")
  })

  it("verifies the codex CLI login without an API key", async () => {
    const ambient = {
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }
    delete process.env.CODEX_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const body = await getHealth("codex")
      expect(body.providerId).toBe("codex")
      expect(["local-login", "not-logged-in", "cli-not-found", "unreachable"]).toContain(
        body.code,
      )
      expect(body.detail ?? "").not.toMatch(/sk-/)
    } finally {
      for (const [key, value] of Object.entries(ambient)) {
        if (value !== undefined) process.env[key] = value
      }
    }
  })
})
