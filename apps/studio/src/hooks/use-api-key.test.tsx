// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useActiveConfig } from "./use-debug"
import { useProviderCredentials } from "./use-provider-credentials"
import { useBookSpeechAvailability } from "./use-api-key"

vi.mock("./use-debug", () => ({ useActiveConfig: vi.fn() }))
vi.mock("./use-provider-credentials", () => ({ useProviderCredentials: vi.fn() }))
vi.mock("./use-effective-default-model", () => ({ useEffectiveDefaultModel: vi.fn() }))

/** Only Gemini Speech has a key; the global speech default stays on OpenAI. */
const isAvailable = vi.fn(
  (modality: string, modelId?: string) => modality === "tts" && modelId === "gemini:default",
)

function renderWithSpeechConfig(speech: unknown) {
  vi.mocked(useProviderCredentials).mockReturnValue({
    isAvailable,
  } as unknown as ReturnType<typeof useProviderCredentials>)
  vi.mocked(useActiveConfig).mockReturnValue({
    data: { merged: speech === undefined ? {} : { speech } },
  } as unknown as ReturnType<typeof useActiveConfig>)
  return renderHook(() => useBookSpeechAvailability("book"))
}

afterEach(() => {
  cleanup()
  isAvailable.mockClear()
})

describe("useBookSpeechAvailability", () => {
  it("checks the book's speech provider rather than the global default", () => {
    const { result } = renderWithSpeechConfig({ default_provider: "gemini" })
    expect(result.current).toBe(true)
    expect(isAvailable).toHaveBeenCalledWith("tts", "gemini:default")
  })

  it("falls back to OpenAI, like the speech stage, when the book sets no provider", () => {
    const { result } = renderWithSpeechConfig(undefined)
    expect(result.current).toBe(false)
    expect(isAvailable).toHaveBeenCalledWith("tts", "openai:default")
  })
})
