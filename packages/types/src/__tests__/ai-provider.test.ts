import { describe, expect, it } from "vitest"
import { ProviderManifest, applySharedCredentialFallbacks } from "../ai-provider.js"

const label = { en: "API key", "pt-BR": "Chave", es: "Clave", fr: "Clé", sq: "Çelës" }

function rawManifest(id: string, sharedWith?: { providerId: string; fieldKey: string }) {
  return {
    id,
    displayName: id,
    modalities: ["tts"],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label,
        required: true,
        header: `X-ADT-Provider-${id}-Key`,
        storageKey: `adt-studio-${id}-key`,
        ...(sharedWith ? { sharedWith } : {}),
      },
    ],
    capabilities: { tts: { formats: ["wav"], instructions: false } },
  }
}

describe("applySharedCredentialFallbacks", () => {
  const manifests = [
    rawManifest("google"),
    rawManifest("gemini", { providerId: "google", fieldKey: "apiKey" }),
  ].map((m) => ProviderManifest.parse(m))

  it("fills an empty shared field from the source provider", () => {
    const values = { google: { apiKey: " AIza-google " } }
    expect(applySharedCredentialFallbacks(manifests, values)).toEqual({
      google: { apiKey: " AIza-google " },
      gemini: { apiKey: "AIza-google" },
    })
  })

  it("leaves a field with its own value alone", () => {
    const values = { google: { apiKey: "AIza-google" }, gemini: { apiKey: "AIza-gemini" } }
    expect(applySharedCredentialFallbacks(manifests, values)).toBe(values)
  })

  it("returns the input untouched when the source is empty too", () => {
    const values = { google: { apiKey: "  " } }
    expect(applySharedCredentialFallbacks(manifests, values)).toBe(values)
    expect(applySharedCredentialFallbacks(manifests, {})).toEqual({})
  })

  it("never mutates the input", () => {
    const values = { google: { apiKey: "AIza-google" } }
    applySharedCredentialFallbacks(manifests, values)
    expect(values).toEqual({ google: { apiKey: "AIza-google" } })
  })
})

describe("ProviderManifest sharedWith", () => {
  it("accepts a field shared with another provider", () => {
    const parsed = ProviderManifest.parse(
      rawManifest("gemini", { providerId: "google", fieldKey: "apiKey" }),
    )
    expect(parsed.credentialFields[0].sharedWith).toEqual({
      providerId: "google",
      fieldKey: "apiKey",
    })
  })

  it("rejects a field shared with its own provider", () => {
    const result = ProviderManifest.safeParse(
      rawManifest("gemini", { providerId: "gemini", fieldKey: "apiKey" }),
    )
    expect(result.success).toBe(false)
  })
})
