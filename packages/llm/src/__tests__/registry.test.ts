import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  ProvidersResponse,
  type LocalizedText,
  type ProviderManifest,
} from "@adt/types"
import { createProviderRegistry } from "../registry.js"
import { AiProviderError } from "../ports/errors.js"
import type { AnyProviderModule, ProviderModule } from "../ports/index.js"
import { BUILT_IN_PROVIDERS, createDefaultProviderRegistry } from "../providers/index.js"

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
  const module: ProviderModule<{ apiKey: string }> = {
    manifest: makeManifest(),
    credentialSchema: z.object({ apiKey: z.string().min(1) }),
    cacheFingerprint: () => ({ adapterVersion: "fake-1", origin: "https://fake.test" }),
    createStructuredTextBackend: () => ({
      generateStructured: async () => {
        throw new Error("not used")
      },
    }),
  }
  return { ...(module as AnyProviderModule), ...overrides }
}

describe("createProviderRegistry", () => {
  it("preserves registration order", () => {
    const registry = createProviderRegistry()
      .register(makeModule({ manifest: makeManifest({ id: "b" }) }))
      .register(makeModule({ manifest: makeManifest({ id: "a" }) }))
      .freeze()

    expect(registry.ids).toEqual(["b", "a"])
  })

  it("rejects duplicate provider ids", () => {
    const registry = createProviderRegistry().register(makeModule())
    expect(() => registry.register(makeModule())).toThrow(/Duplicate provider id "fake"/)
  })

  it("rejects a modality declared without a factory", () => {
    expect(() =>
      createProviderRegistry().register(
        makeModule({
          manifest: makeManifest({
            modalities: ["structured-text", "tts"],
            capabilities: {
              ...makeManifest().capabilities,
              tts: {
                formats: ["mp3"],
                voices: [],
                languages: [],
                instructions: false,
                rateLimitMode: "fixed",
              },
            },
          }),
        }),
      ),
    ).toThrow(/declares modality "tts" but does not implement createSpeechSynthesizer/)
  })

  it("rejects two providers claiming the same header", () => {
    const registry = createProviderRegistry().register(makeModule())
    const colliding = makeManifest({ id: "other" })
    colliding.credentialFields[0]!.header = "X-ADT-Provider-fake-Key"
    expect(() => registry.register(makeModule({ manifest: colliding }))).toThrow(
      /already used by "fake"/,
    )
  })

  it("detects a header collision case-insensitively", () => {
    const registry = createProviderRegistry().register(makeModule())
    const colliding = makeManifest({ id: "other" })
    colliding.credentialFields[0]!.header = "x-adt-provider-FAKE-key"
    expect(() => registry.register(makeModule({ manifest: colliding }))).toThrow(
      /already used by "fake"/,
    )
  })

  it("rejects a manifest missing a locale", () => {
    const broken = makeManifest()
    broken.credentialFields[0]!.label = { en: "API key" } as LocalizedText
    expect(() => createProviderRegistry().register(makeModule({ manifest: broken }))).toThrow(
      /Invalid provider manifest/,
    )
  })

  it("rejects a credential field claiming a forbidden header", () => {
    const broken = makeManifest()
    broken.credentialFields[0]!.header = "Authorization"
    expect(() => createProviderRegistry().register(makeModule({ manifest: broken }))).toThrow(
      /Invalid provider manifest/,
    )
  })

  it("refuses registration after freeze", () => {
    const registry = createProviderRegistry()
    registry.freeze()
    expect(() => registry.register(makeModule())).toThrow(/frozen/)
  })

  it("is isolated per instance", () => {
    createProviderRegistry().register(makeModule())
    expect(createProviderRegistry().ids).toEqual([])
  })
})

describe("registry resolution", () => {
  let registry: ReturnType<typeof createProviderRegistry>

  beforeEach(() => {
    registry = createProviderRegistry().register(makeModule())
  })

  it("resolves a backend with credentials from the request", () => {
    const resolved = registry.resolveStructuredText("fake:fake-1", {
      credentials: { fake: { apiKey: "secret" } },
    })

    expect(resolved.providerId).toBe("fake")
    expect(resolved.modelId).toBe("fake-1")
    expect(resolved.qualifiedModelId).toBe("fake:fake-1")
    expect(resolved.fingerprint).toEqual({
      adapterVersion: "fake-1",
      origin: "https://fake.test",
    })
  })

  it("never puts a credential value into the fingerprint", () => {
    const resolved = registry.resolveStructuredText("fake:fake-1", {
      credentials: { fake: { apiKey: "super-secret-value" } },
    })
    expect(JSON.stringify(resolved.fingerprint)).not.toContain("super-secret-value")
  })

  it("fails with missing-credential when a required field is absent", () => {
    try {
      registry.resolveStructuredText("fake:fake-1")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(AiProviderError.is(error)).toBe(true)
      expect((error as AiProviderError).code).toBe("missing-credential")
      expect((error as AiProviderError).message).not.toContain("apiKey")
    }
  })

  it("fails with unknown-provider for an unregistered provider", () => {
    try {
      registry.resolveStructuredText("nope:model")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("unknown-provider")
    }
  })

  it("fails with unsupported-modality for a declared-but-absent modality", () => {
    try {
      registry.resolveImage("fake:fake-1", { credentials: { fake: { apiKey: "k" } } })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("unsupported-modality")
    }
  })

  it("fails with invalid-model-id for a malformed id", () => {
    try {
      registry.resolveStructuredText("openai")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("unknown-provider")
    }
    try {
      registry.resolveStructuredText("Open_AI:model")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as AiProviderError).code).toBe("invalid-model-id")
    }
  })

  it("prefers request credentials over the model-level capability default", () => {
    const capabilityAware = createProviderRegistry()
      .register(
        makeModule({
          capabilitiesFor: (modality, modelId) =>
            modality === "structured-text"
              ? ({
                  strategies: modelId === "fake-2" ? ["parse-repair"] : ["json-mode"],
                  recursiveSchemas: true,
                  imageInput: false,
                  temperature: true,
                } as never)
              : undefined,
        }),
      )
      .freeze()

    const options = { credentials: { fake: { apiKey: "k" } } }
    expect(capabilityAware.capabilities("structured-text", "fake:fake-2", options))
      .toMatchObject({ strategies: ["parse-repair"] })
    expect(capabilityAware.capabilities("structured-text", "fake:fake-1", options))
      .toMatchObject({ strategies: ["json-mode"] })
  })
})

describe("built-in provider registry", () => {
  it("bootstraps every built-in provider", () => {
    const registry = createDefaultProviderRegistry()
    expect(registry.ids).toEqual([
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
    expect(registry.ids).toHaveLength(BUILT_IN_PROVIDERS.length)
  })

  it("exposes modality support that matches the manifests", () => {
    const registry = createDefaultProviderRegistry()
    expect(registry.providersFor("tts").map((m) => m.manifest.id)).toEqual([
      "openai",
      "azure",
      "elevenlabs",
      "gemini",
    ])
    expect(registry.providersFor("stt").map((m) => m.manifest.id)).toEqual(["openai"])
    expect(registry.providersFor("image").map((m) => m.manifest.id)).toEqual(["openai"])
  })

  it("produces a descriptor payload that validates and carries no secrets", () => {
    const registry = createDefaultProviderRegistry()
    const payload = {
      providers: registry.descriptors(),
      defaults: {
        "structured-text": "openai:gpt-5.4",
        image: "openai:gpt-image-2",
      },
    }

    const parsed = ProvidersResponse.safeParse(payload)
    expect(parsed.success).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
  })

  it("keeps the legacy headers of the pre-existing providers", () => {
    const registry = createDefaultProviderRegistry()
    const headerFor = (providerId: string, key: string) =>
      registry
        .get(providerId)
        .manifest.credentialFields.find((field) => field.key === key)?.header

    expect(headerFor("openai", "apiKey")).toBe("X-OpenAI-Key")
    expect(headerFor("anthropic", "apiKey")).toBe("X-Anthropic-API-Key")
    expect(headerFor("google", "apiKey")).toBe("X-Google-API-Key")
    expect(headerFor("custom", "baseUrl")).toBe("X-Custom-Base-URL")
    expect(headerFor("custom", "apiKey")).toBe("X-Custom-API-Key")
    expect(headerFor("azure", "apiKey")).toBe("X-Azure-Speech-Key")
    expect(headerFor("azure", "region")).toBe("X-Azure-Speech-Region")
    expect(headerFor("gemini", "apiKey")).toBe("X-Gemini-API-Key")
  })
})
