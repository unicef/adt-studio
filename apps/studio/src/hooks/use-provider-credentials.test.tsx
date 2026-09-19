// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProviderDescriptor, ProvidersResponse } from "@adt/types"
import { getProviders } from "@/api/client"
import { useProviderCredentials } from "./use-provider-credentials"

vi.mock("@/api/client", () => ({ getProviders: vi.fn() }))

const providersQuery = vi.mocked(getProviders)

function descriptor(): ProviderDescriptor {
  return {
    manifest: {
      id: "fake",
      displayName: "Fake",
      modalities: ["structured-text"],
      credentialFields: [
        {
          key: "apiKey",
          kind: "secret",
          label: { en: "Key", "pt-BR": "Key", es: "Key", fr: "Key", sq: "Key" },
          required: true,
          header: "X-ADT-Provider-Fake-Key",
          legacyHeaders: [],
          storageKey: "adt-studio-fake-key",
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
      defaultModels: {},
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  }
}

function renderCredentials() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useProviderCredentials(), { wrapper })
}

afterEach(() => {
  providersQuery.mockReset()
  window.localStorage.clear()
})

describe("useProviderCredentials", () => {
  it("buffers writes made before /providers resolves and flushes them on load", async () => {
    let resolveProviders!: (value: ProvidersResponse) => void
    providersQuery.mockImplementation(
      () => new Promise<ProvidersResponse>((resolve) => (resolveProviders = resolve)),
    )

    const { result } = renderCredentials()

    // Onboarding writes a keystroke while the manifest list is still loading —
    // this must neither throw nor drop the input.
    act(() => result.current.setCredential("fake", "apiKey", "sk-typed"))
    expect(result.current.credentialValue("fake", "apiKey")).toBe("sk-typed")
    expect(window.localStorage.getItem("adt-studio-fake-key")).toBeNull()

    act(() => resolveProviders({ providers: [descriptor()], defaults: {} }))

    await waitFor(() =>
      expect(window.localStorage.getItem("adt-studio-fake-key")).toBe("sk-typed"),
    )
    expect(result.current.credentialValue("fake", "apiKey")).toBe("sk-typed")
  })

  it("writes straight to storage once providers are loaded", async () => {
    providersQuery.mockResolvedValue({ providers: [descriptor()], defaults: {} })

    const { result } = renderCredentials()
    await waitFor(() => expect(result.current.providers).toHaveLength(1))

    act(() => result.current.setCredential("fake", "apiKey", "sk-direct"))

    expect(window.localStorage.getItem("adt-studio-fake-key")).toBe("sk-direct")
    await waitFor(() =>
      expect(result.current.credentialValue("fake", "apiKey")).toBe("sk-direct"),
    )
  })
})
