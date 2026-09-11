// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api, type ReadingOrderEntry, type ReadingOrderResponse } from "@/api/client"
import { readingOrderKey, useSaveReadingOrder } from "./use-reading-order"

vi.mock("@/api/client", () => ({
  api: { updateReadingOrder: vi.fn() },
}))

const label = "test-book"

function entries(ids: string): ReadingOrderEntry[] {
  return ids.split(" ").map((id) => ({ kind: "section", id }))
}

/**
 * Three slots, of which "b" is out of the book: it holds a place in `order`
 * but has no rendered item and takes no book-page number. That asymmetry is
 * the whole reason the optimistic update cannot simply mirror the saved list.
 */
function cached(): ReadingOrderResponse {
  return {
    version: 4,
    fromStoredOrder: true,
    reconciled: false,
    added: [],
    dropped: [],
    items: [
      { kind: "section", id: "a", href: "a.html", position: 1, pageId: "pg001", pageNumber: 1 },
      { kind: "section", id: "c", href: "c.html", position: 2, pageId: "pg003", pageNumber: 3 },
    ],
    order: entries("a b c"),
  }
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  queryClient.setQueryData(readingOrderKey(label), cached())
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useSaveReadingOrder(label), { wrapper })
  const read = () => queryClient.getQueryData<ReadingOrderResponse>(readingOrderKey(label))!
  return { result, queryClient, invalidateQueries, read }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useSaveReadingOrder", () => {
  it("moves the row in the cache before the request lands", async () => {
    // Without this the row visibly snaps back to its old slot until the
    // refetch arrives, which reads as the drag having failed.
    let resolveSave: (value: { version: number }) => void = () => {}
    vi.mocked(api.updateReadingOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )

    const { result, read } = setup()
    result.current.mutate({ items: entries("c b a"), expectedVersion: 4 })

    await waitFor(() => {
      expect(read().order.map((e) => e.id)).toEqual(["c", "b", "a"])
    })
    // Still in flight, and the cache already shows the new sequence.
    expect(vi.mocked(api.updateReadingOrder)).toHaveBeenCalledWith(label, entries("c b a"), 4)

    resolveSave({ version: 5 })
  })

  it("renumbers only the pages the book actually shows", async () => {
    vi.mocked(api.updateReadingOrder).mockResolvedValue({ version: 5 })

    const { result, read } = setup()
    result.current.mutate({ items: entries("c b a"), expectedVersion: 4 })

    await waitFor(() => {
      // "b" is out of the book: it keeps its slot in `order` but never appears
      // in `items`, and the positions run 1..n over what is left.
      expect(read().items.map((i) => `${i.id}@${String(i.position)}`)).toEqual(["c@1", "a@2"])
    })
  })

  it("puts the previous order back when the save fails", async () => {
    // A rejected save (a 409 from a concurrent edit, most likely) must not
    // leave the sidebar showing an order the server does not have.
    vi.mocked(api.updateReadingOrder).mockRejectedValue(new Error("conflict"))

    const { result, read } = setup()
    result.current.mutate({ items: entries("c b a"), expectedVersion: 4 })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(read().order.map((e) => e.id)).toEqual(["a", "b", "c"])
    expect(read().items.map((i) => i.id)).toEqual(["a", "c"])
  })

  it("refreshes the order and the two things a reorder invalidates", async () => {
    vi.mocked(api.updateReadingOrder).mockResolvedValue({ version: 5 })

    const { result, invalidateQueries } = setup()
    result.current.mutate({ items: entries("c b a"), expectedVersion: 4 })

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: readingOrderKey(label) })
    })
    // The bundle and its accessibility assessment are stale server-side.
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["books", label, "step-status"],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["package-adt-status", label] })
    // Nothing else about the book changed: a reorder must not throw away the
    // user's generated speech, translations or glossary.
    const keys = invalidateQueries.mock.calls.map((c) => JSON.stringify(c[0]))
    expect(keys.some((k) => k.includes("text-catalog"))).toBe(false)
    expect(keys.some((k) => k.includes("tts"))).toBe(false)
  })

  it("still refreshes after a failed save", async () => {
    // onSettled, not onSuccess — otherwise a failure leaves the cache holding
    // the rolled-back order with no refetch to correct it.
    vi.mocked(api.updateReadingOrder).mockRejectedValue(new Error("conflict"))

    const { result, invalidateQueries } = setup()
    result.current.mutate({ items: entries("c b a"), expectedVersion: 4 })

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: readingOrderKey(label) })
    })
  })
})
