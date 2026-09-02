import { describe, expect, it, vi } from "vitest"
import type { CredentialFieldManifest, ProviderDescriptor } from "@adt/types"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) text += String(values[index])
    }
    return { id: text }
  },
}))

const { authKind, requiredFieldsFilled } = await import("./useProviders")

function field(key: string, required: boolean): CredentialFieldManifest {
  return {
    key,
    kind: key === "baseUrl" ? "url" : "secret",
    label: { en: key, "pt-BR": key, es: key, fr: key, sq: key },
    required,
    header: `X-${key}`,
    legacyHeaders: [],
    storageKey: `test-${key}`,
    legacyStorageKeys: [],
  }
}

function descriptor(
  fields: CredentialFieldManifest[],
  onServer: Record<string, boolean>,
): ProviderDescriptor {
  return {
    manifest: {
      id: "probe",
      displayName: "Probe",
      modalities: ["structured-text"],
      credentialFields: fields,
      capabilities: {
        "structured-text": {
          strategies: ["json-schema"],
          recursiveSchemas: true,
          imageInput: false,
          temperature: true,
        },
      },
      defaultModels: {},
    },
    configuredOnServer: Object.values(onServer).some(Boolean),
    fieldStatus: fields.map((f) => ({ key: f.key, configuredOnServer: onServer[f.key] ?? false })),
  }
}

describe("requiredFieldsFilled — fieldStatus alignment", () => {
  it("counts a typed-in value as filled regardless of ordering", () => {
    const d = descriptor([field("baseUrl", false), field("apiKey", true)], {})
    expect(requiredFieldsFilled(d, { apiKey: "sk-live" })).toBe(true)
  })

  it("required-first ordering: a server-stored required key counts as filled", () => {
    const d = descriptor([field("apiKey", true), field("baseUrl", false)], { apiKey: true })
    expect(requiredFieldsFilled(d, {})).toBe(true)
  })

  it("optional-first ordering: a server-stored required key still counts as filled", () => {
    const d = descriptor([field("baseUrl", false), field("apiKey", true)], { apiKey: true })
    expect(requiredFieldsFilled(d, {})).toBe(true)
  })

  it("optional-first ordering: a server-stored optional field does not satisfy the required one", () => {
    const d = descriptor([field("baseUrl", false), field("apiKey", true)], { baseUrl: true })
    expect(requiredFieldsFilled(d, {})).toBe(false)
  })
})

describe("authKind", () => {
  it("treats an all-optional manifest with a secret as a CLI backend", () => {
    expect(authKind(descriptor([field("apiKey", false)], {}))).toBe("cli")
  })

  it("treats an all-optional manifest without a secret as a local backend", () => {
    expect(authKind(descriptor([field("baseUrl", false)], {}))).toBe("local")
  })

  it("treats any required field as an API-key backend", () => {
    expect(authKind(descriptor([field("apiKey", true)], {}))).toBe("api-key")
  })
})
