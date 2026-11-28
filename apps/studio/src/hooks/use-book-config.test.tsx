// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { renderHook, cleanup, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query"

vi.mock("@/api/client", () => ({ api: { updateBookConfig: vi.fn().mockResolvedValue({}), getBookConfig: vi.fn() } }))

const { useUpdateBookConfig } = await import("./use-book-config")
afterEach(() => cleanup())

it.each([
  { speech: { excluded_categories: ["easy-read"] } },
  { speech: { excluded_text_ids: ["phrase"] } },
  { easy_read: { enabled: true } },
  { easy_read: { enabled: false } },
])("refreshes output attention after a config or exclusion save: %j", async (config) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const outputsKey = ["books", "book", "outputs"]
  client.setQueryData(outputsKey, { status: "current" })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useUpdateBookConfig(), { wrapper })
  await result.current.mutateAsync({ label: "book", config })
  expect(client.getQueryState(outputsKey)?.isInvalidated).toBe(true)
  client.clear()
})


it("refreshes only the saved book and Library, once per query", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const keys = [["books"], ["books", "book", "outputs"], ["debug", "stats", "book"], ["debug", "config", "book"], ["book-config", "book"], ["books", "other", "outputs"], ["debug", "stats", "other"], ["books", "book", "step-status", "confirmation", "sectioning", "action", 1]]
  const reads = keys.map(() => vi.fn(async () => "fresh"))
  const stops = keys.map((key, index) => {
    client.setQueryData(key, "old")
    return new QueryObserver(client, { queryKey: key, queryFn: reads[index] }).subscribe(() => {})
  })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useUpdateBookConfig(), { wrapper })
  try {
    await act(async () => { await result.current.mutateAsync({ label: "book", config: {} }) })
    for (const read of reads.slice(0, 5)) expect(read).toHaveBeenCalledTimes(1)
    for (const read of reads.slice(5)) expect(read).not.toHaveBeenCalled()
  } finally { stops.forEach(stop => stop()); client.clear() }
})

it("awaits authoritative settings but not slow derived summaries", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const keys = [["book-config", "book"], ["debug", "config", "book"], ["books", "book", "outputs"]]
  const releases: Array<() => void> = []
  const reads = keys.map((_, index) => vi.fn(() => new Promise<string>(resolve => { releases[index] = () => resolve("fresh") })))
  const stops = keys.map((key, index) => {
    client.setQueryData(key, "old")
    return new QueryObserver(client, { queryKey: key, queryFn: reads[index] }).subscribe(() => {})
  })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useUpdateBookConfig(), { wrapper })
  let settled = false
  const saving = result.current.mutateAsync({ label: "book", config: {} }).then(() => { settled = true })
  try {
    await waitFor(() => expect(reads[2]).toHaveBeenCalled())
    expect(settled).toBe(false)
    await act(async () => releases[0]())
    expect(settled).toBe(false)
    await act(async () => releases[1]())
    await waitFor(() => expect(settled).toBe(true))
    expect(client.getQueryData(keys[2])).toBe("old")
  } finally {
    await act(async () => { releases.forEach(release => release()); await saving })
    stops.forEach(stop => stop()); client.clear()
  }
})
