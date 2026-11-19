// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/** The provider the missing-provider prompts name: the global default text model's. */

const providers = [
  { manifest: { id: "openai", displayName: "OpenAI" } },
  { manifest: { id: "anthropic", displayName: "Anthropic" } },
]
let state = {
  providers,
  defaults: { "structured-text": "anthropic:claude-opus-4-6" } as Record<string, string>,
  isAvailable: (_modality: string) => false,
  isLoading: false,
  error: null as unknown,
}

vi.mock("@/hooks/use-provider-credentials", () => ({ useProviderCredentials: () => state }))

const { useMissingTextProvider } = await import("./use-api-key")
const initial = state

afterEach(() => {
  state = initial
})

describe("useMissingTextProvider", () => {
  it("names the default text model's provider when it can't run", () => {
    const { result } = renderHook(() => useMissingTextProvider())
    expect(result.current).toEqual({ providerId: "anthropic", displayName: "Anthropic" })
  })

  it("falls back to OpenAI for a bare model id", () => {
    state = { ...initial, defaults: { "structured-text": "gpt-5" } }
    const { result } = renderHook(() => useMissingTextProvider())
    expect(result.current?.providerId).toBe("openai")
  })

  it("says nothing while loading, after a failed load, or once the default model can run", () => {
    state = { ...initial, isLoading: true }
    expect(renderHook(() => useMissingTextProvider()).result.current).toBeNull()
    state = { ...initial, error: new Error("down") }
    expect(renderHook(() => useMissingTextProvider()).result.current).toBeNull()
    state = { ...initial, isAvailable: () => true }
    expect(renderHook(() => useMissingTextProvider()).result.current).toBeNull()
  })
})
