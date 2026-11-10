// @vitest-environment jsdom
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProviderHealthResponse } from "@adt/types"

/**
 * Real query cache, mocked network: the "key rejected" warning must follow the
 * check of the *saved* key only, and must clear once a valid key is saved.
 */

const secretField = { key: "apiKey", kind: "secret", required: true }
const providers = [
  {
    manifest: { id: "openai", displayName: "OpenAI", credentialFields: [secretField] },
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  // A CLI backend: its key field is optional, so it can never be "rejected".
  {
    manifest: {
      id: "codex",
      displayName: "OpenAI Codex",
      credentialFields: [{ ...secretField, required: false }],
    },
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  // An OpenAI-compatible endpoint: the URL is required, the key is optional.
  {
    manifest: {
      id: "custom",
      displayName: "Custom",
      credentialFields: [
        { key: "baseUrl", kind: "url", required: true },
        { ...secretField, required: false },
      ],
    },
    fieldStatus: [
      { key: "baseUrl", configuredOnServer: false },
      { key: "apiKey", configuredOnServer: false },
    ],
  },
]
let credentials: Record<string, Record<string, string>> = {}
let defaults: Record<string, string> = { "structured-text": "openai:gpt-5" }

/** What the API answers for the saved key, and for a draft typed in Settings. */
let storedCode: ProviderHealthResponse["code"] = "ok"
let draftCode: ProviderHealthResponse["code"] = "ok"
const getProviderHealth = vi.fn(
  async (providerId: string, draft?: Record<string, string>): Promise<ProviderHealthResponse> => {
    const code = draft ? draftCode : storedCode
    return { providerId, ok: code === "ok", code }
  },
)

vi.mock("@/api/client", () => ({
  getProviderHealth: (providerId: string, draft?: Record<string, string>) =>
    getProviderHealth(providerId, draft),
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    providers,
    defaults,
    credentials,
    isAvailable: () => true,
  }),
}))

const { useRejectedTextProvider } = await import("./use-api-key")
const { useProviderHealth } = await import("./use-provider-health")

let queryClient: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  storedCode = "ok"
  draftCode = "ok"
  defaults = { "structured-text": "openai:gpt-5" }
  credentials = {}
  getProviderHealth.mockClear()
})

afterEach(() => {
  cleanup()
  queryClient.clear()
})

describe("useRejectedTextProvider", () => {
  it("warns when the saved key is rejected", async () => {
    storedCode = "invalid-credential"
    const { result } = renderHook(() => useRejectedTextProvider(), { wrapper })
    await waitFor(() =>
      expect(result.current).toEqual({ providerId: "openai", displayName: "OpenAI" }),
    )
  })

  it("ignores a wrong draft checked in Settings while the saved key is fine", async () => {
    draftCode = "invalid-credential"
    const { result } = renderHook(
      () => ({
        warning: useRejectedTextProvider(),
        // The Settings card checks the unsaved draft for the same provider.
        draft: useProviderHealth("openai", { apiKey: "sk-wrong" }, true),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.draft.data?.code).toBe("invalid-credential"))
    await act(() => result.current.draft.refetch())
    expect(result.current.warning).toBeNull()
  })

  it("keeps warning when a good draft is checked over a rejected saved key", async () => {
    storedCode = "invalid-credential"
    const { result } = renderHook(
      () => ({
        warning: useRejectedTextProvider(),
        draft: useProviderHealth("openai", { apiKey: "sk-good" }, true),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.draft.data?.code).toBe("ok"))
    await waitFor(() => expect(result.current.warning).not.toBeNull())
  })

  it("clears once a valid key is saved and the checks are refreshed", async () => {
    storedCode = "invalid-credential"
    const { result } = renderHook(() => useRejectedTextProvider(), { wrapper })
    await waitFor(() => expect(result.current).not.toBeNull())

    // Saving in Settings invalidates every provider's checks.
    storedCode = "ok"
    await act(() => queryClient.invalidateQueries({ queryKey: ["provider-health"] }))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it("never probes a provider that has no required API key", async () => {
    defaults = { "structured-text": "codex:gpt-5-codex" }
    const { result } = renderHook(() => useRejectedTextProvider(), { wrapper })
    // Give any (wrongly) enabled query a chance to run.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(result.current).toBeNull()
    expect(getProviderHealth).not.toHaveBeenCalled()
  })

  it("checks an optional key once it is set, and warns when it is rejected", async () => {
    defaults = { "structured-text": "custom:my-model" }
    credentials = { custom: { baseUrl: "http://localhost:8000/v1", apiKey: "wrong" } }
    storedCode = "invalid-credential"
    const { result } = renderHook(() => useRejectedTextProvider(), { wrapper })
    await waitFor(() =>
      expect(result.current).toEqual({ providerId: "custom", displayName: "Custom" }),
    )
  })

  it("does not probe a provider whose optional key is unset", async () => {
    defaults = { "structured-text": "custom:my-model" }
    credentials = { custom: { baseUrl: "http://localhost:8000/v1" } }
    renderHook(() => useRejectedTextProvider(), { wrapper })
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(getProviderHealth).not.toHaveBeenCalled()
  })

  it("does not probe while the user types in a Settings form", async () => {
    // The form's draft check, as ApiKeyPanel uses it:
    // the first value is the saved key, then the user clears and types.
    const { rerender } = renderHook(
      ({ apiKey }: { apiKey: string }) => useProviderHealth("openai", { apiKey }, true),
      { wrapper, initialProps: { apiKey: "sk-saved" } },
    )
    await waitFor(() => expect(getProviderHealth).toHaveBeenCalledTimes(1))
    for (const apiKey of ["", "s", "sk-", "sk-new-key"]) rerender({ apiKey })
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(getProviderHealth).toHaveBeenCalledTimes(1)
  })
})
