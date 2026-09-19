import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
  ModelDiscoveryResponse,
  ProviderCliLoginStatus,
  ProviderHealthResponse,
  ProvidersResponse,
} from "@adt/types"
import { createProviderRegistry, type AnyProviderModule, type CliLoginSession } from "@adt/llm"
import {
  CLI_ACTION_HEADER,
  CLI_ACTION_HEADER_VALUE,
  createProviderRoutes,
} from "./providers.js"

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
    expect(body.defaults.agent).toBe("openai:gpt-5.5")
    expect(body.defaults.image).toBe("openai:gpt-image-2")
    expect(body.defaults.tts).toBe("openai:gpt-4o-mini-tts")
    expect(body.defaults.stt).toBe("openai:whisper-1")
  })

  it("follows default_model's provider for the agent default when agents.model is unset", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "default_model: anthropic:claude-opus-4",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults["structured-text"]).toBe("anthropic:claude-opus-4")
    // The provider's declared agent default, so a user with only an Anthropic
    // key gets working agent features instead of a gate on an OpenAI model.
    expect(body.defaults.agent).toBe("anthropic:claude-opus-4-6")
  })

  it("uses Google's current Pro model for agents when a Gemini model is the default", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "default_model: google:gemini-3.5-flash",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults["structured-text"]).toBe("google:gemini-3.5-flash")
    expect(body.defaults.agent).toBe("google:gemini-3.1-pro-preview")
  })

  it("keeps the agents runtime default when default_model's provider cannot run agents", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "default_model: claude-agent:sonnet",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults.agent).toBe("openai:gpt-5.5")
  })

  it("derives the tts default from speech.default_provider", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "speech:",
        "  default_provider: azure",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults.tts).toBe("azure:default")
  })

  it("uses the tts provider's manifest default model when the config names none", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "speech:",
        "  default_provider: elevenlabs",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults.tts).toBe("elevenlabs:eleven_multilingual_v2")
  })

  it("qualifies a configured speech model with the default speech provider", async () => {
    fs.writeFileSync(
      configPath,
      [
        "structure_types: {}",
        "role_types: {}",
        "speech:",
        "  default_provider: gemini",
        "  model: gemini-2.5-flash-preview-tts",
      ].join("\n"),
      "utf-8",
    )

    const body = await getProviders()
    expect(body.defaults.tts).toBe("gemini:gemini-2.5-flash-preview-tts")
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

describe("CLI sign-in routes", () => {
  const localized = (en: string) => ({ en, "pt-BR": en, es: en, fr: en, sq: en })

  function deferred() {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    promise.catch(() => {})
    return { promise, resolve, reject }
  }

  function cliModule(overrides: Partial<AnyProviderModule> = {}): AnyProviderModule {
    const module = {
      manifest: {
        id: "fakecli",
        displayName: "Fake CLI",
        modalities: ["structured-text" as const],
        credentialFields: [
          {
            key: "apiKey",
            kind: "secret" as const,
            label: localized("API key"),
            required: false,
            header: "X-ADT-Provider-Fakecli-Key",
            legacyHeaders: [],
            storageKey: "adt-studio-fakecli-key",
            legacyStorageKeys: [],
          },
        ],
        capabilities: {
          "structured-text": {
            strategies: ["json-mode" as const],
            recursiveSchemas: true,
            imageInput: false,
            temperature: true,
          },
        },
        defaultModels: { "structured-text": "fake-1" },
      },
      credentialSchema: z.object({ apiKey: z.string().optional() }),
      cacheFingerprint: () => ({ adapterVersion: "fake-1", origin: "local://fake" }),
      createStructuredTextBackend: () => ({
        generateStructured: async () => {
          throw new Error("not used")
        },
      }),
    }
    return { ...(module as unknown as AnyProviderModule), ...overrides }
  }

  function appWith(module: AnyProviderModule) {
    return createProviderRoutes(configPath, createProviderRegistry().register(module).freeze())
  }

  async function status(app: ReturnType<typeof createProviderRoutes>, init?: RequestInit) {
    const headers = new Headers(init?.headers)
    if (init?.method && init.method !== "GET") {
      headers.set(CLI_ACTION_HEADER, CLI_ACTION_HEADER_VALUE)
    }
    const response = await app.request(
      "/providers/fakecli/cli-login",
      init ? { ...init, headers } : undefined,
    )
    expect(response.status).toBe(200)
    return ProviderCliLoginStatus.parse(await response.json())
  }

  it("returns 404 for an unknown provider and 400 for one without a CLI sign-in", async () => {
    const app = createProviderRoutes(configPath)
    const headers = { [CLI_ACTION_HEADER]: CLI_ACTION_HEADER_VALUE }
    expect((await app.request("/providers/nope/cli-login", { method: "POST", headers })).status).toBe(404)
    expect((await app.request("/providers/openai/cli-login", { method: "POST", headers })).status).toBe(400)
    expect((await app.request("/providers/openai/cli-logout", { method: "POST", headers })).status).toBe(400)
  })

  it("exposes the sign-in capability on the descriptor", async () => {
    const app = appWith(cliModule({ cliLogin: { start: vi.fn(), logout: vi.fn() } }))
    const body = ProvidersResponse.parse(await (await app.request("/providers")).json())
    expect(body.providers[0]?.supportsCliLogin).toBe(true)

    const plain = createProviderRoutes(configPath)
    const openai = ProvidersResponse.parse(await (await plain.request("/providers")).json())
    expect(openai.providers.find((p) => p.manifest.id === "openai")?.supportsCliLogin).toBe(false)
  })

  it("hides and disables browser OAuth outside Electron and local development", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADT_ENVIRONMENT", "")
    try {
      const start = vi.fn()
      const app = appWith(cliModule({ cliLogin: { start, logout: vi.fn() } }))
      const body = ProvidersResponse.parse(await (await app.request("/providers")).json())

      expect(body.providers[0]?.supportsCliLogin).toBe(false)
      expect((await app.request("/providers/fakecli/cli-login")).status).toBe(400)
      expect(
        (await app.request("/providers/fakecli/cli-login", {
          method: "POST",
          headers: { [CLI_ACTION_HEADER]: CLI_ACTION_HEADER_VALUE },
        })).status,
      ).toBe(400)
      expect(start).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("requires a non-simple request header for every CLI state change", async () => {
    const cancel = vi.fn()
    const logout = vi.fn()
    const start = vi.fn(async () => ({
      url: "https://auth.example.com/authorize",
      completion: deferred().promise,
      cancel,
    }))
    const app = appWith(cliModule({ cliLogin: { start, logout } }))

    expect((await app.request("/providers/fakecli/cli-login", { method: "POST" })).status).toBe(403)
    expect(start).not.toHaveBeenCalled()

    await status(app, { method: "POST" })
    expect((await app.request("/providers/fakecli/cli-login", { method: "DELETE" })).status).toBe(403)
    expect((await app.request("/providers/fakecli/cli-logout", { method: "POST" })).status).toBe(403)
    expect(cancel).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()

    await status(app, { method: "DELETE" })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("relays the sign-in URL, then drops it once the CLI reports success", async () => {
    const completion = deferred()
    const session: CliLoginSession = {
      url: "https://auth.example.com/authorize",
      completion: completion.promise,
      cancel: vi.fn(),
    }
    const start = vi.fn(async () => session)
    const app = appWith(cliModule({ cliLogin: { start, logout: vi.fn() } }))

    const started = await status(app, { method: "POST" })
    expect(started).toEqual({
      providerId: "fakecli",
      state: "pending",
      url: "https://auth.example.com/authorize",
    })
    expect(start).toHaveBeenCalledTimes(1)

    // A second POST while waiting is idempotent: no second CLI process.
    expect(await status(app, { method: "POST" })).toEqual(started)
    expect(start).toHaveBeenCalledTimes(1)
    expect(await status(app)).toEqual(started)

    completion.resolve()
    await new Promise((resolve) => setImmediate(resolve))
    expect(await status(app)).toEqual({ providerId: "fakecli", state: "done" })
    // Served once: a reopened panel must not re-announce an old sign-in.
    expect(await status(app)).toEqual({ providerId: "fakecli", state: "idle" })
  })

  it("cancels a sign-in that was still starting up so the CLI does not keep the port", async () => {
    const cancel = vi.fn()
    let releaseStart!: (session: CliLoginSession) => void
    const start = vi.fn(
      () => new Promise<CliLoginSession>((resolve) => {
        releaseStart = resolve
      }),
    )
    const app = appWith(cliModule({ cliLogin: { start, logout: vi.fn() } }))

    const starting = app.request("/providers/fakecli/cli-login", {
      method: "POST",
      headers: { [CLI_ACTION_HEADER]: CLI_ACTION_HEADER_VALUE },
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(start).toHaveBeenCalledTimes(1)
    expect(await status(app, { method: "DELETE" })).toEqual({ providerId: "fakecli", state: "idle" })

    releaseStart({
      url: "https://auth.example.com/authorize",
      completion: deferred().promise,
      cancel,
    })
    const started = ProviderCliLoginStatus.parse(await (await starting).json())

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(started).toEqual({ providerId: "fakecli", state: "idle" })
    expect(await status(app)).toEqual({ providerId: "fakecli", state: "idle" })
  })

  it("reports a failed sign-in with the CLI's message and never a stale URL", async () => {
    const completion = deferred()
    const app = appWith(
      cliModule({
        cliLogin: {
          start: async () => ({
            url: "https://auth.example.com/authorize",
            completion: completion.promise,
            cancel: vi.fn(),
          }),
          logout: vi.fn(),
        },
      }),
    )
    await status(app, { method: "POST" })

    completion.reject(new Error("authorization was denied"))
    await new Promise((resolve) => setImmediate(resolve))

    expect(await status(app)).toEqual({
      providerId: "fakecli",
      state: "failed",
      detail: "authorization was denied",
    })
    // The failure is reported once, not on every later visit.
    expect(await status(app)).toEqual({ providerId: "fakecli", state: "idle" })
  })

  it("turns a CLI that cannot even start into a failed state instead of a 500", async () => {
    const app = appWith(
      cliModule({
        cliLogin: {
          start: async () => {
            throw new Error("Codex CLI not found: nope")
          },
          logout: vi.fn(),
        },
      }),
    )

    const result = await status(app, { method: "POST" })
    expect(result.state).toBe("failed")
    expect(result.detail).toMatch(/Codex CLI not found/)
    expect(await status(app)).toEqual({ providerId: "fakecli", state: "idle" })
  })

  it("cancels a waiting sign-in and returns to idle", async () => {
    const cancel = vi.fn()
    const app = appWith(
      cliModule({
        cliLogin: {
          start: async () => ({
            url: "https://auth.example.com/authorize",
            completion: deferred().promise,
            cancel,
          }),
          logout: vi.fn(),
        },
      }),
    )
    await status(app, { method: "POST" })

    expect(await status(app, { method: "DELETE" })).toEqual({ providerId: "fakecli", state: "idle" })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("signs out through the provider port and surfaces its failure", async () => {
    const logout = vi.fn(async () => {})
    const app = appWith(cliModule({ cliLogin: { start: vi.fn(), logout } }))
    const headers = { [CLI_ACTION_HEADER]: CLI_ACTION_HEADER_VALUE }
    const ok = await app.request("/providers/fakecli/cli-logout", { method: "POST", headers })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    expect(logout).toHaveBeenCalledTimes(1)

    const failing = appWith(
      cliModule({
        cliLogin: {
          start: vi.fn(),
          logout: async () => {
            throw new Error("logout exited with code 1")
          },
        },
      }),
    )
    const failed = await failing.request("/providers/fakecli/cli-logout", { method: "POST", headers })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: "logout exited with code 1" })
  })
})
