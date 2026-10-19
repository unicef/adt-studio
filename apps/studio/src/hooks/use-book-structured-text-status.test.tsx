// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBookStructuredTextStatus } from "./use-api-key"

const credentials = {
  isAvailable: vi.fn(),
  isLoading: false,
  error: null as unknown,
  providers: [],
  credentialValue: () => "",
  setCredential: vi.fn(),
}
const config = { data: undefined as unknown, isLoading: false }

vi.mock("./use-provider-credentials", () => ({ useProviderCredentials: () => credentials }))
vi.mock("./use-debug", () => ({ useActiveConfig: () => config }))

describe("useBookStructuredTextStatus", () => {
  beforeEach(() => {
    credentials.isAvailable.mockReset().mockReturnValue(false)
    Object.assign(credentials, { isLoading: false, error: null })
    Object.assign(config, { data: undefined, isLoading: false })
  })

  it("is not ready while the provider list is loading", () => {
    credentials.isLoading = true
    expect(renderHook(() => useBookStructuredTextStatus("b")).result.current.ready).toBe(false)
  })

  it("is not ready when the provider list failed to load", () => {
    credentials.error = new Error("boom")
    expect(renderHook(() => useBookStructuredTextStatus("b")).result.current.ready).toBe(false)
  })

  it("is not ready while the book config is loading", () => {
    config.isLoading = true
    expect(renderHook(() => useBookStructuredTextStatus("b")).result.current.ready).toBe(false)
  })

  it("is ready and unavailable when nothing can run the default model", () => {
    const { result } = renderHook(() => useBookStructuredTextStatus("b"))
    expect(result.current).toEqual({ available: false, ready: true })
  })

  it("checks availability against the book's own default model", () => {
    config.data = { merged: { default_model: "anthropic:claude-sonnet" } }
    credentials.isAvailable.mockImplementation((_modality: string, model?: string) => model === "anthropic:claude-sonnet")
    const { result } = renderHook(() => useBookStructuredTextStatus("b"))
    expect(result.current).toEqual({ available: true, ready: true })
  })
})
