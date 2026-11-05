// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useActiveConfig } from "./use-debug"
import { useBook } from "./use-books"
import { useProviderCredentials } from "./use-provider-credentials"
import { useBookSpeechAvailability, useWordHighlightingUnavailable } from "./use-api-key"

vi.mock("./use-debug", () => ({ useActiveConfig: vi.fn() }))
vi.mock("./use-books", () => ({ useBook: vi.fn() }))
vi.mock("./use-provider-credentials", () => ({ useProviderCredentials: vi.fn() }))
vi.mock("./use-effective-default-model", () => ({ useEffectiveDefaultModel: vi.fn() }))

/** Only Gemini Speech has a key; the global speech default stays on OpenAI. */
const isAvailable = vi.fn(
  (modality: string, modelId?: string) => modality === "tts" && modelId === "gemini:default",
)

function renderWithConfig(merged: Record<string, unknown> | undefined, bookLanguage = "en") {
  vi.mocked(useProviderCredentials).mockReturnValue({
    isAvailable,
  } as unknown as ReturnType<typeof useProviderCredentials>)
  vi.mocked(useActiveConfig).mockReturnValue({
    data: merged === undefined ? undefined : { merged },
  } as unknown as ReturnType<typeof useActiveConfig>)
  vi.mocked(useBook).mockReturnValue({
    data: { languageCode: bookLanguage },
  } as unknown as ReturnType<typeof useBook>)
  return renderHook(() => useBookSpeechAvailability("book"))
}

afterEach(() => {
  cleanup()
  isAvailable.mockClear()
})

describe("useBookSpeechAvailability", () => {
  it("checks the book's speech provider rather than the global default", () => {
    const { result } = renderWithConfig({ speech: { default_provider: "gemini" } })
    expect(result.current).toBe(true)
    expect(isAvailable).toHaveBeenCalledWith("tts", "gemini:default")
  })

  it("falls back to OpenAI, like the speech stage, when the book sets no provider", () => {
    const { result } = renderWithConfig({})
    expect(result.current).toBe(false)
    expect(isAvailable).toHaveBeenCalledWith("tts", "openai:default")
  })

  it("follows a language routed to another provider, like the Speech view's Run", () => {
    const { result } = renderWithConfig({
      output_languages: ["fr"],
      speech: { default_provider: "openai", providers: { gemini: { languages: ["fr"] } } },
    })
    expect(result.current).toBe(true)
  })

  it("counts a secondary narrator on another provider", () => {
    const { result } = renderWithConfig({
      speech: { default_provider: "openai", secondary_voices: { en: { provider: "gemini", voice: "Kore" } } },
    })
    expect(result.current).toBe(true)
  })

  it("stays unavailable until the book's config has loaded", () => {
    const { result } = renderWithConfig(undefined)
    expect(result.current).toBe(false)
  })
})

describe("useWordHighlightingUnavailable", () => {
  function renderWithProviders(state: { isLoading?: boolean; error?: unknown; stt: boolean }) {
    vi.mocked(useProviderCredentials).mockReturnValue({
      isAvailable: (modality: string) => modality === "stt" && state.stt,
      isLoading: state.isLoading ?? false,
      error: state.error ?? null,
    } as unknown as ReturnType<typeof useProviderCredentials>)
    return renderHook(() => useWordHighlightingUnavailable()).result.current
  }

  it("is unavailable once providers have loaded without a transcriber", () => {
    expect(renderWithProviders({ stt: false })).toBe(true)
  })

  it("is available with a transcriber", () => {
    expect(renderWithProviders({ stt: true })).toBe(false)
  })

  it("does not claim unavailable while providers load or after they fail to load", () => {
    expect(renderWithProviders({ isLoading: true, stt: false })).toBe(false)
    expect(renderWithProviders({ error: new Error("offline"), stt: false })).toBe(false)
  })
})
