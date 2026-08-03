import { describe, expect, it } from "vitest"
import { z } from "zod"
import { ProviderHealthResponse, type LocalizedText, type ProviderManifest } from "@adt/types"
import { createProviderRegistry } from "../registry.js"
import { checkProviderConnection } from "../provider-health.js"
import { ModelDiscoveryError } from "../model-discovery.js"
import { AiProviderError } from "../ports/errors.js"
import type { AnyProviderModule, ProviderModule } from "../ports/index.js"
import { checkClaudeAgentConnection } from "../providers/claude-agent/connection.js"
import {
  checkCodexConnection,
  type CodexStatusRunner,
} from "../providers/codex/connection.js"
import type { CodexProcessResult } from "../providers/codex/cli.js"

const label: LocalizedText = {
  en: "API key",
  "pt-BR": "Chave de API",
  es: "Clave de API",
  fr: "Clé d'API",
  sq: "Kyçi API",
}

function makeManifest(overrides: Partial<ProviderManifest> = {}): ProviderManifest {
  const id = overrides.id ?? "fake"
  return {
    id,
    displayName: "Fake",
    modalities: ["structured-text"],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label,
        required: true,
        header: `X-ADT-Provider-${id}-Key`,
        legacyHeaders: [],
        storageKey: `adt-studio-${id}-key`,
        legacyStorageKeys: [],
      },
    ],
    capabilities: {
      "structured-text": {
        strategies: ["json-mode"],
        recursiveSchemas: true,
        imageInput: false,
        temperature: true,
      },
    },
    defaultModels: { "structured-text": "fake-1" },
    ...overrides,
  }
}

function makeModule(overrides: Partial<AnyProviderModule> = {}): AnyProviderModule {
  const module: ProviderModule<{ apiKey?: string }> = {
    manifest: makeManifest(),
    credentialSchema: z.object({ apiKey: z.string().optional() }),
    cacheFingerprint: () => ({ adapterVersion: "fake-1", origin: "https://fake.test" }),
    createStructuredTextBackend: () => ({
      generateStructured: async () => {
        throw new Error("not used")
      },
    }),
  }
  return { ...(module as AnyProviderModule), ...overrides }
}

function registryWith(module: AnyProviderModule) {
  return createProviderRegistry().register(module).freeze()
}

const CREDENTIALS = { fake: { apiKey: "sk-fake" } }

describe("checkProviderConnection", () => {
  it("reports unsupported for an unknown provider", async () => {
    const registry = registryWith(makeModule())
    expect(await checkProviderConnection(registry, "nope")).toEqual({
      providerId: "nope",
      ok: false,
      code: "unsupported",
    })
  })

  it("returns a Zod-valid payload", async () => {
    const registry = registryWith(makeModule({ listModels: async () => [{ id: "a" }] }))
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(ProviderHealthResponse.parse(result)).toEqual(result)
  })

  it("counts models when discovery is the only probe", async () => {
    const registry = registryWith(
      makeModule({ listModels: async () => [{ id: "a" }, { id: "b" }] }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result).toEqual({ providerId: "fake", ok: true, code: "ok", modelCount: 2 })
  })

  it("reports a missing required credential without calling the provider", async () => {
    let called = false
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          called = true
          return []
        },
      }),
    )
    const result = await checkProviderConnection(registry, "fake")
    expect(called).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.code).toBe("missing-credential")
  })

  it("upgrades a rejected key from missing-credential to invalid-credential", async () => {
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          throw new ModelDiscoveryError("missing-credential", "HTTP 401")
        },
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result.code).toBe("invalid-credential")
    expect(result.detail).toBe("HTTP 401")
  })

  it("maps transport failures to unreachable", async () => {
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          throw new ModelDiscoveryError("unreachable", "Could not reach http://127.0.0.1:11434/v1/models")
        },
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result).toEqual({
      providerId: "fake",
      ok: false,
      code: "unreachable",
      detail: "Could not reach http://127.0.0.1:11434/v1/models",
    })
  })

  it("never echoes an unexpected error message", async () => {
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          throw new Error("boom sk-leaked")
        },
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result).toEqual({ providerId: "fake", ok: false, code: "unreachable" })
  })

  it("maps an AiProviderError to its health code", async () => {
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          throw AiProviderError.invalidCredential("fake", "malformed")
        },
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result.code).toBe("invalid-credential")
  })

  it("prefers checkConnection over discovery", async () => {
    const registry = registryWith(
      makeModule({
        listModels: async () => {
          throw new Error("discovery must not run")
        },
        checkConnection: async () => ({ ok: true, code: "local-login" }),
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result).toEqual({
      providerId: "fake",
      ok: true,
      code: "local-login",
      modelCount: undefined,
    })
  })

  it("truncates an over-long detail to the DTO limit", async () => {
    const registry = registryWith(
      makeModule({
        checkConnection: async () => ({
          ok: false,
          code: "unreachable",
          detail: "x".repeat(500),
        }),
      }),
    )
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result.detail).toHaveLength(200)
    expect(() => ProviderHealthResponse.parse(result)).not.toThrow()
  })

  it("reports configured when no probe exists but credentials are required", async () => {
    const registry = registryWith(makeModule())
    const result = await checkProviderConnection(registry, "fake", {
      credentials: CREDENTIALS,
    })
    expect(result).toEqual({ providerId: "fake", ok: true, code: "configured" })
  })

  it("reports unsupported when there is nothing to verify at all", async () => {
    const registry = registryWith(
      makeModule({ manifest: makeManifest({ credentialFields: [] }) }),
    )
    const result = await checkProviderConnection(registry, "fake")
    expect(result).toEqual({ providerId: "fake", ok: false, code: "unsupported" })
  })
})

describe("checkClaudeAgentConnection", () => {
  const context = { providerId: "claude-agent", credentials: {} as { apiKey?: string } }

  it("verifies an API key against the model catalogue", async () => {
    const result = await checkClaudeAgentConnection(
      { ...context, credentials: { apiKey: "sk-ant-test" } },
      { listModels: async () => [{ id: "claude-sonnet-4-5" }, { id: "claude-opus-4-6" }] },
    )
    expect(result).toEqual({ ok: true, code: "ok", modelCount: 2 })
  })

  it("accepts the local Claude Code login when no key is set", async () => {
    const result = await checkClaudeAgentConnection(context, {
      loadSdk: async () => ({}),
      hasLogin: () => true,
    })
    expect(result).toEqual({ ok: true, code: "local-login" })
  })

  it("reports not-logged-in when no login file exists", async () => {
    const result = await checkClaudeAgentConnection(context, {
      loadSdk: async () => ({}),
      hasLogin: () => false,
    })
    expect(result).toEqual({ ok: false, code: "not-logged-in" })
  })

  it("reports cli-not-found when the SDK is missing", async () => {
    const result = await checkClaudeAgentConnection(context, {
      loadSdk: async () => {
        throw new Error("Cannot find module")
      },
      hasLogin: () => true,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe("cli-not-found")
  })
})

describe("checkCodexConnection", () => {
  const context = { providerId: "codex", credentials: {} as { apiKey?: string } }

  interface StatusCall {
    executable: string
    args: string[]
    env: Record<string, string>
  }

  function fakeStatus(result: Partial<CodexProcessResult> = {}): {
    runCommand: CodexStatusRunner
    calls: StatusCall[]
  } {
    const calls: StatusCall[] = []
    return {
      calls,
      runCommand: (executable, args, env) => {
        calls.push({ executable, args, env })
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0, ...result })
      },
    }
  }

  it("asks the CLI for its own login verdict", async () => {
    const fake = fakeStatus({ stdout: "Logged in using ChatGPT\n" })
    const result = await checkCodexConnection(context, {
      runCommand: fake.runCommand,
      executable: "codex",
    })
    expect(fake.calls[0].args).toEqual(["login", "status"])
    expect(result).toEqual({ ok: true, code: "local-login", detail: "ChatGPT account" })
  })

  it("reads the login line the CLI prints on stderr", async () => {
    const fake = fakeStatus({ stderr: "Logged in using ChatGPT\n" })
    const result = await checkCodexConnection(context, {
      runCommand: fake.runCommand,
      executable: "codex",
    })
    expect(result).toEqual({ ok: true, code: "local-login", detail: "ChatGPT account" })
  })

  it("never echoes the masked key the CLI prints", async () => {
    const fake = fakeStatus({ stderr: "Logged in using an API key - sk-proj-***b_60A\n" })
    const result = await checkCodexConnection(
      { ...context, credentials: { apiKey: "sk-proj-secret" } },
      { runCommand: fake.runCommand, executable: "codex" },
    )
    expect(result).toEqual({ ok: true, code: "ok", detail: "API key" })
    expect(JSON.stringify(result)).not.toContain("sk-proj")
  })

  it("reports not-logged-in on a non-zero exit", async () => {
    const fake = fakeStatus({ stdout: "Not logged in\n", exitCode: 1 })
    const result = await checkCodexConnection(context, {
      runCommand: fake.runCommand,
      executable: "codex",
    })
    expect(result).toEqual({ ok: false, code: "not-logged-in" })
  })

  it("reports cli-not-found when the executable is absent", async () => {
    const result = await checkCodexConnection(context, {
      executable: "adt-codex-does-not-exist",
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe("cli-not-found")
    expect(result.detail).toContain("adt-codex-does-not-exist")
  })

  it("keeps an ambient key out of the probe environment", async () => {
    const fake = fakeStatus()
    process.env.OPENAI_API_KEY = "sk-ambient"
    try {
      await checkCodexConnection(context, {
        executable: "codex",
        runCommand: fake.runCommand,
      })
    } finally {
      delete process.env.OPENAI_API_KEY
    }
    expect(fake.calls[0].env.OPENAI_API_KEY).toBeUndefined()
    expect(fake.calls[0].env.CODEX_API_KEY).toBeUndefined()
  })
})
