import { describe, expect, it } from "vitest"
import type { ProviderDescriptor } from "@adt/types"
import {
  buildProviderCredentialHeaders,
  isAiOperationAvailable,
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
