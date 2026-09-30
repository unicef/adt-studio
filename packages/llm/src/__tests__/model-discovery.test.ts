import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { LocalizedText, ProviderManifest } from "@adt/types"
import { createProviderRegistry } from "../registry.js"
import { discoverModels, ModelDiscoveryError } from "../model-discovery.js"
import type { AnyProviderModule, DiscoveredModel, ProviderModule } from "../ports/index.js"

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

function makeModule(
  listModels?: ProviderModule<{ apiKey: string }>["listModels"],
  overrides: Partial<AnyProviderModule> = {},
): AnyProviderModule {
  const module: ProviderModule<{ apiKey: string }> = {
    manifest: makeManifest(),
    credentialSchema: z.object({ apiKey: z.string().min(1) }),
    cacheFingerprint: () => ({ adapterVersion: "fake-1", origin: "https://fake.test" }),
    createStructuredTextBackend: () => ({
      generateStructured: async () => {
        throw new Error("not used")
      },
    }),
    listModels,
  }
  return { ...(module as AnyProviderModule), ...overrides }
}

const creds = { credentials: { fake: { apiKey: "secret" } } }

describe("registry.supportsModelDiscovery", () => {
  it("is false when the provider has no listModels", () => {
    const registry = createProviderRegistry().register(makeModule()).freeze()
    expect(registry.supportsModelDiscovery("fake")).toBe(false)
  })

  it("is true when the provider implements listModels", () => {
    const registry = createProviderRegistry()
      .register(makeModule(async () => []))
      .freeze()
    expect(registry.supportsModelDiscovery("fake")).toBe(true)
  })
})

describe("registry.listModels", () => {
  it("passes validated credentials to the provider", async () => {
    let seen = ""
    const registry = createProviderRegistry()
      .register(
        makeModule(async (context) => {
          seen = context.credentials.apiKey
          return [{ id: "m-1" }]
        }),
      )
      .freeze()

    const models = await registry.listModels("fake", creds)
    expect(seen).toBe("secret")
    expect(models).toEqual([{ id: "m-1" }])
  })

  it("dedupes by id, keeping the first occurrence", async () => {
    const registry = createProviderRegistry()
      .register(
        makeModule(async () => [
          { id: "dup", displayName: "First" },
          { id: "dup", displayName: "Second" },
          { id: "unique" },
        ]),
      )
      .freeze()

    const models = await registry.listModels("fake", creds)
    expect(models).toEqual([{ id: "dup", displayName: "First" }, { id: "unique" }])
  })

  it("filters by modality but keeps models without declared modalities", async () => {
    const catalogue: DiscoveredModel[] = [
      { id: "text-only", modalities: ["structured-text"] },
      { id: "image-only", modalities: ["image"] },
      { id: "unknown" },
    ]
    const registry = createProviderRegistry()
      .register(makeModule(async () => catalogue))
      .freeze()

    const models = await registry.listModels("fake", { ...creds, modality: "structured-text" })
    expect(models.map((m) => m.id)).toEqual(["text-only", "unknown"])
  })

  it("throws missing-credential (via AiProviderError) when required creds are absent", async () => {
    const registry = createProviderRegistry()
      .register(makeModule(async () => [{ id: "m-1" }]))
      .freeze()
    await expect(registry.listModels("fake")).rejects.toThrow()
  })
})

describe("discoverModels", () => {
  it("reports unsupported for an unknown provider without throwing", async () => {
    const registry = createProviderRegistry().register(makeModule()).freeze()
    const result = await discoverModels(registry, "missing", creds)
    expect(result).toEqual({
      providerId: "missing",
      supported: false,
      models: [],
      error: "unsupported",
    })
  })

  it("reports unsupported when the provider lacks discovery", async () => {
    const registry = createProviderRegistry().register(makeModule()).freeze()
    const result = await discoverModels(registry, "fake", creds)
    expect(result.supported).toBe(false)
    expect(result.error).toBe("unsupported")
  })

  it("returns the discovered models on success", async () => {
    const registry = createProviderRegistry()
      .register(makeModule(async () => [{ id: "m-1" }, { id: "m-2" }]))
      .freeze()
    const result = await discoverModels(registry, "fake", creds)
    expect(result.supported).toBe(true)
    expect(result.models.map((m) => m.id)).toEqual(["m-1", "m-2"])
  })

  it("maps a ModelDiscoveryError to its code", async () => {
    const registry = createProviderRegistry()
      .register(
        makeModule(async () => {
          throw new ModelDiscoveryError("unreachable", "boom")
        }),
      )
      .freeze()
    const result = await discoverModels(registry, "fake", creds)
    expect(result.supported).toBe(false)
    expect(result.error).toBe("unreachable")
  })

  it("maps a missing credential to missing-credential", async () => {
    const registry = createProviderRegistry()
      .register(makeModule(async () => [{ id: "m-1" }]))
      .freeze()
    const result = await discoverModels(registry, "fake")
    expect(result.supported).toBe(false)
    expect(result.error).toBe("missing-credential")
  })
})
