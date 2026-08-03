// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProviderDescriptor } from "@adt/types"
import { ApiKeyDialog } from "./ApiKeyDialog"

const setCredential = vi.fn()
const emptyCredentials = {}

const fakeProvider: ProviderDescriptor = {
  manifest: {
    id: "fake",
    displayName: "Fake Provider",
    modalities: ["structured-text"],
    credentialFields: [
      {
        key: "token",
        kind: "secret",
        label: { en: "Fake token", "pt-BR": "Token fake", es: "Token falso", fr: "Jeton fictif", sq: "Token provë" },
        required: true,
        header: "X-ADT-Provider-Fake-Token",
        legacyHeaders: [],
        storageKey: "adt-studio-fake-token",
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
  },
  configuredOnServer: false,
  fieldStatus: [{ key: "token", configuredOnServer: false }],
}
const fakeProviders = [fakeProvider]

vi.mock("@lingui/core", () => ({ i18n: { locale: "en" } }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), ""),
  }),
}))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/hooks/use-provider-health", () => ({
  useProviderHealth: () => ({
    data: { providerId: "fake", ok: true, code: "configured" },
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    providers: fakeProviders,
    credentials: emptyCredentials,
    setCredential,
    isLoading: false,
    error: null,
  }),
}))

afterEach(() => {
  cleanup()
  setCredential.mockClear()
})

describe("ApiKeyDialog", () => {
  it("renders and saves fields from an unknown provider manifest", () => {
    render(<ApiKeyDialog embedded open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Fake Provider")).toBeTruthy()
    const input = screen.getByLabelText("Fake token")
    fireEvent.change(input, { target: { value: "manifest-secret" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(setCredential).toHaveBeenCalledWith("fake", "token", "manifest-secret")
  })
})
