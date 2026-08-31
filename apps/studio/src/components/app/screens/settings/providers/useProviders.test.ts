import { describe, expect, it, vi } from "vitest"
import type { CredentialFieldManifest, ProviderDescriptor } from "./contract"

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

const { requiredFieldsFilled } = await import("./useProviders")
const { PROVIDER_DESCRIPTORS } = await import("./data")

function field(key: string, required: boolean): CredentialFieldManifest {
  return {
    key,
    kind: key === "baseUrl" ? "url" : "secret",
    label: { en: key },
    required,
    header: `X-${key}`,
    storageKey: `test-${key}`,
  }
}

function descriptor(fields: CredentialFieldManifest[], onServer: Record<string, boolean>): ProviderDescriptor {
  return {
    manifest: {
      id: "probe",
      displayName: "Probe",
      modalities: ["structured-text"],
      credentialFields: fields,
      defaultModels: {},
    },
    configuredOnServer: Object.values(onServer).some(Boolean),
    fieldStatus: fields.map((f) => ({ key: f.key, configuredOnServer: onServer[f.key] ?? false })),
  }
}

describe("requiredFieldsFilled — masking preconditions in the bundled descriptors", () => {
  it("marks no bundled field as configuredOnServer, so the fieldStatus branch is dead today", () => {
    const onServer = PROVIDER_DESCRIPTORS.flatMap((d) => d.fieldStatus).filter((s) => s.configuredOnServer)
    expect(onServer).toEqual([])
  })

  it("lists required fields before optional ones in every bundled mixed manifest", () => {
    const misordered = PROVIDER_DESCRIPTORS.filter((d) => {
      const required = d.manifest.credentialFields.map((f) => f.required)
      if (!required.includes(true) || !required.includes(false)) return false
      return required.indexOf(true) > required.indexOf(false)
    }).map((d) => d.manifest.id)
    expect(misordered).toEqual([])
  })
})

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
