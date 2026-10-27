import { describe, expect, it } from "vitest"
import type { ProviderDescriptor } from "@adt/types"
import {
  buildProviderCredentialHeaders,
  isAiOperationAvailable,
  readOwnProviderCredentialsFromStorage,
  readProviderCredentialsFromStorage,
  writeProviderCredentialToStorage,
} from "./provider-credentials"

function descriptor(): ProviderDescriptor {
  return {
    manifest: {
      id: "fake",
      displayName: "Fake",
      modalities: ["structured-text"],
      credentialFields: [
        {
          key: "token",
          kind: "secret",
          label: { en: "Token", "pt-BR": "Token", es: "Token", fr: "Token", sq: "Token" },
          required: true,
          header: "X-ADT-Provider-Fake-Token",
          legacyHeaders: [],
          storageKey: "adt-studio-fake-token",
          legacyStorageKeys: ["old-fake-token"],
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
      defaultModels: {},
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "token", configuredOnServer: false }],
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  }
}

/** Two providers where the second's token falls back to the first's (Gemini Speech ← Google). */
function sharedPair(): [ProviderDescriptor, ProviderDescriptor] {
  const google = descriptor()
  google.manifest.id = "google"
  const gemini = descriptor()
  gemini.manifest.id = "gemini"
  gemini.manifest.credentialFields[0].storageKey = "adt-studio-gemini-token"
  gemini.manifest.credentialFields[0].legacyStorageKeys = []
  gemini.manifest.credentialFields[0].sharedWith = { providerId: "google", fieldKey: "token" }
  return [google, gemini]
}

describe("provider credentials", () => {
  it("builds headers from a provider manifest without provider-specific branches", () => {
    expect(
      buildProviderCredentialHeaders([descriptor()], {
        fake: { token: "  secret  ", ignored: "not-public" },
        unknown: { token: "not-sent" },
      }),
    ).toEqual({ "X-ADT-Provider-Fake-Token": "secret" })
  })

  it("reads legacy storage keys when the canonical key is absent", () => {
    const storage = memoryStorage({ "old-fake-token": "legacy-secret" })
    expect(readProviderCredentialsFromStorage([descriptor()], storage)).toEqual({
      fake: { token: "legacy-secret" },
    })
  })

  it("writes the canonical storage key and removes legacy copies", () => {
    const storage = memoryStorage({ "old-fake-token": "stale" })
    writeProviderCredentialToStorage(descriptor(), "token", " new-secret ", storage)
    expect(Object.fromEntries(storage.values)).toEqual({
      "adt-studio-fake-token": "new-secret",
    })
  })

  it("fills a shared credential from the other provider's stored key", () => {
    const [google, gemini] = sharedPair()
    const storage = memoryStorage({ "adt-studio-fake-token": "AIza-google" })

    expect(readOwnProviderCredentialsFromStorage([google, gemini], storage)).toEqual({
      google: { token: "AIza-google" },
    })
    expect(readProviderCredentialsFromStorage([google, gemini], storage)).toEqual({
      google: { token: "AIza-google" },
      gemini: { token: "AIza-google" },
    })
  })

  it("keeps a provider's own stored key over the shared one", () => {
    const [google, gemini] = sharedPair()
    const storage = memoryStorage({
      "adt-studio-fake-token": "AIza-google",
      "adt-studio-gemini-token": "AIza-gemini",
    })

    expect(readProviderCredentialsFromStorage([google, gemini], storage)).toEqual({
      google: { token: "AIza-google" },
      gemini: { token: "AIza-gemini" },
    })
  })

  it("uses the effective model provider and server-side credential status", () => {
    const provider = descriptor()
    expect(
      isAiOperationAvailable(
        [{ ...provider, configuredOnServer: true, fieldStatus: [{ key: "token", configuredOnServer: true }] }],
        {},
        { "structured-text": "fake:model" },
        "structured-text",
      ),
    ).toBe(true)
    expect(
      isAiOperationAvailable(
        [provider],
        {},
        { "structured-text": "fake:model" },
        "structured-text",
      ),
    ).toBe(false)
  })
})
