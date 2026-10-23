// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useTTS } from "./use-tts"
import { api } from "@/api/client"

vi.mock("@/api/client", () => ({
  api: { getTTS: vi.fn() },
  getAudioUrl: (book: string, language: string, file: string) => `/books/${book}/audio/${language}/${file}`,
}))
afterEach(cleanup)
it.each(["pt_BR", undefined])("plays through physical locale and supports older server responses (%s)", async storageLanguage => {
  vi.mocked(api.getTTS).mockResolvedValue({ languages: { "pt-BR": {
    storageLanguage, version: 1, generatedAt: "old", entries: [
      { textId: "pg001_t001", fileName: "legacy.wav", voice: "Narrator", model: "old", cached: false, voiceSlot: "primary" },
    ],
  } } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, unmount } = renderHook(() => useTTS("book"), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  await waitFor(() => expect(result.current.hasTTS).toBe(true))
  expect(result.current.audioMap.get("pg001_t001")).toBe(`/books/book/audio/${storageLanguage ?? "pt-BR"}/legacy.wav`)
  unmount()
  client.clear()
})
