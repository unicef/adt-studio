// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PublicationReaderList } from "@adt/types"

const getPublicationReaders = vi.fn()

vi.mock("@/api/client", () => ({
  api: { getPublicationReaders },
}))

const { usePublicationReaders } = await import("./use-publications")
const { COMMENTS_POLL_MS } = await import("./use-publication-feedback")

const TOKEN = "TokenRavenTokenRavenTokenRaven12"

function roster(names: string[]): PublicationReaderList {
  return {
    readers: names.map((name, index) => ({
      id: `session-${index}`,
      name,
      color: "#e5484d",
      joined_at: "2026-10-27T16:17:01.382Z",
      comment_count: 0,
      last_comment_at: null,
    })),
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.useRealTimers()
  getPublicationReaders.mockReset()
})

describe("the readers of an open dashboard", () => {
  /** Found on a real share: the dashboard opened with nobody in, both readers joined a minute
   *  later, and it kept saying "Nobody has joined yet" beside their two comments. */
  it("picks up a reader who joins after the page opened, without reopening it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getPublicationReaders.mockResolvedValueOnce(roster([])).mockResolvedValue(roster(["Eliezir", "Eliezir2"]))

    const { result } = renderHook(() => usePublicationReaders(TOKEN, true), { wrapper })
    await waitFor(() => expect(result.current.data?.readers).toEqual([]))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMENTS_POLL_MS + 100)
    })

    await waitFor(() => expect(result.current.data?.readers.map((reader) => reader.name)).toEqual(["Eliezir", "Eliezir2"]))
  })

  it("asks nothing while its panel is closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderHook(() => usePublicationReaders(TOKEN, false), { wrapper })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMENTS_POLL_MS * 2)
    })

    expect(getPublicationReaders).not.toHaveBeenCalled()
  })
})
