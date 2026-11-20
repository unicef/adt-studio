// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/api/client"
import { useBook, useBooks } from "./use-books"

vi.mock("@/api/client", () => ({ api: { getBooks: vi.fn(), getBook: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it("refreshes an unverified Library summary on SPA return after book access", async () => {
  const pending = { label: "book", storyboardVerificationPending: true, completedStages: [] }
  const verified = { label: "book", completedStages: ["storyboard", "preview"] }
  vi.mocked(api.getBooks).mockResolvedValueOnce([pending] as Awaited<ReturnType<typeof api.getBooks>>)
    .mockResolvedValueOnce([verified] as Awaited<ReturnType<typeof api.getBooks>>)
  vi.mocked(api.getBook).mockResolvedValue(verified as Awaited<ReturnType<typeof api.getBook>>)
  // Match the application's five-minute cache, keeping the same client across
  // navigation. A full page reload would hide this regression.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  try {
    const library = renderHook(() => useBooks(), { wrapper })
    await waitFor(() => expect(library.result.current.data).toEqual([pending]))
    library.unmount()
    const book = renderHook(() => useBook("book"), { wrapper })
    await waitFor(() => expect(book.result.current.isSuccess).toBe(true))
    book.unmount()
    const returned = renderHook(() => useBooks(), { wrapper })
    await waitFor(() => expect(returned.result.current.data).toEqual([verified]))
    expect(api.getBooks).toHaveBeenCalledTimes(2)
  } finally { client.clear() }
})
