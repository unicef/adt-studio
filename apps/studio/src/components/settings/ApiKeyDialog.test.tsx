// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProviderDescriptor } from "@adt/types"
import { ApiKeyDialog } from "./ApiKeyDialog"

const setCredential = vi.fn()
const invalidateQueries = vi.fn()
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
/** A provider whose key field declares a shape, like the real OpenAI manifest. */
const shapedProvider: ProviderDescriptor = {
  ...fakeProvider,
  manifest: {
    ...fakeProvider.manifest,
    id: "shaped",
    displayName: "Shaped Provider",
    credentialFields: [
      {
        ...fakeProvider.manifest.credentialFields[0],
        key: "apiKey",
        label: { en: "Shaped key", "pt-BR": "Shaped key", es: "Shaped key", fr: "Shaped key", sq: "Shaped key" },
        header: "X-ADT-Provider-Shaped-Key",
        storageKey: "adt-studio-shaped-key",
        placeholder: "sk-...",
        pattern: "^sk-[A-Za-z0-9_-]+$",
      },
    ],
  },
  fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
}
let fakeProviders: ProviderDescriptor[] = [fakeProvider]
let ownCredentials: Record<string, Record<string, string>> = emptyCredentials

vi.mock("@lingui/core", () => ({ i18n: { locale: "en" } }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), ""),
  }),
}))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn() } }))
const healthCalls: Array<Record<string, string> | undefined> = []
vi.mock("@/hooks/use-provider-health", () => ({
  useProviderHealth: (_providerId: string, draft: Record<string, string> | undefined) => {
    healthCalls.push(draft)
    return {
    data: { providerId: "fake", ok: true, code: "configured" },
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    }
  },
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    providers: fakeProviders,
    credentials: ownCredentials,
    ownCredentials,
    setCredential,
    isLoading: false,
    error: null,
  }),
}))

afterEach(() => {
  cleanup()
  setCredential.mockClear()
  invalidateQueries.mockClear()
  fakeProviders = [fakeProvider]
  ownCredentials = emptyCredentials
  healthCalls.length = 0
})

describe("ApiKeyDialog", () => {
  it("renders and saves fields from an unknown provider manifest", () => {
    render(<ApiKeyDialog embedded open onOpenChange={vi.fn()} />)

    expect(screen.getByText("Fake Provider")).toBeTruthy()
    const input = screen.getByLabelText("Fake token")
    fireEvent.change(input, { target: { value: "manifest-secret" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(setCredential).toHaveBeenCalledWith("fake", "token", "manifest-secret")
    // The saved key is re-checked right away rather than on the first failed run.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider-health"] })
  })

  it("blocks the save with a key-specific message when a typed key has the wrong shape", () => {
    fakeProviders = [shapedProvider]
    render(<ApiKeyDialog embedded open onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("Shaped key"), { target: { value: "not-a-key" } })

    expect(screen.getByText("This doesn't look like a valid key. It should look like sk-...")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true)
  })

  it("does not let an unchanged saved value block saving another provider's key", () => {
    // Saved before the shape rule existed; the user only edits the other provider.
    fakeProviders = [fakeProvider, shapedProvider]
    ownCredentials = { shaped: { apiKey: "legacy-format-key" } }
    render(<ApiKeyDialog embedded open onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("Fake token"), { target: { value: "manifest-secret" } })
    const save = screen.getByRole("button", { name: "Save" })
    expect(save.hasAttribute("disabled")).toBe(false)
    fireEvent.click(save)
    expect(setCredential).toHaveBeenCalledWith("fake", "token", "manifest-secret")
  })

  it("keeps the connection check in the draft scope while typing a first key", () => {
    // Nothing saved for this provider: a scope switch on the first keystroke
    // would change the query key and probe a one-character key.
    render(<ApiKeyDialog embedded open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Fake token"), { target: { value: "s" } })

    expect(healthCalls.length).toBeGreaterThan(1)
    expect(healthCalls.every((draft) => draft !== undefined)).toBe(true)
  })
})
