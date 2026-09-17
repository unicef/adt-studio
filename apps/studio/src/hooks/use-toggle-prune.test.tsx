// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import { readingOrderKey } from "./use-reading-order"
import { useTogglePrune } from "./use-toggle-prune"

vi.mock("@/api/client", () => ({
  api: { getPage: vi.fn(), saveStoryboard: vi.fn(), reRenderPage: vi.fn() },
}))

const hasStructuredTextProvider = vi.fn(() => true)
vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({ apiKey: "sk-test" }),
  useBookStructuredTextAvailability: () => hasStructuredTextProvider(),
}))

const label = "test-book"
const pageId = "pg001"

/**
 * One page, two sections. `pruned` says whether section 0 is currently out of
 * the book, and `html` whether the storyboard ever rendered it — the pair that
 * decides whether putting it back needs the LLM.
 */
function pageDetail({ pruned, html }: { pruned: boolean; html: boolean }) {
  return {
    pageId,
    sectioningTree: {
      reasoning: "",
      sections: [
        { sectionId: "pg001_sec001", sectionType: "content", isPruned: pruned, nodes: [] },
        { sectionId: "pg001_sec002", sectionType: "content", isPruned: false, nodes: [] },
      ],
    },
    rendering: {
      sections: [
        ...(html ? [{ sectionIndex: 0, html: "<p>one</p>" }] : []),
        { sectionIndex: 1, html: "<p>two</p>" },
      ],
    },
  }
}

function setup(detail: ReturnType<typeof pageDetail>) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  queryClient.setQueryData(["books", label, "pages", pageId], detail)
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useTogglePrune(label), { wrapper })
  return { result, invalidateQueries }
}

/** The `isPruned` flags in the sectioning that was actually saved. */
function savedPruneFlags(call = 0): boolean[] {
  const body = vi.mocked(api.saveStoryboard).mock.calls[call][2] as {
    sectioning: { sections: Array<{ isPruned: boolean }> }
  }
  return body.sectioning.sections.map((s) => s.isPruned)
}

function savedInSync(call = 0): boolean {
  return (vi.mocked(api.saveStoryboard).mock.calls[call][2] as { renderingInSync: boolean })
    .renderingInSync
}

beforeEach(() => {
  vi.clearAllMocks()
  hasStructuredTextProvider.mockReturnValue(true)
  vi.mocked(api.saveStoryboard).mockResolvedValue({ sectioningVersion: 2, renderingVersion: 2 })
  vi.mocked(api.reRenderPage).mockResolvedValue({ taskId: "t1", status: "submitted" })
})

describe("useTogglePrune", () => {
  it("removes a section from the book without touching its neighbour", async () => {
    const { result } = setup(pageDetail({ pruned: false, html: true }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(savedPruneFlags()).toEqual([true, false])
    // The HTML is still there, so nothing needs re-rendering.
    expect(savedInSync()).toBe(true)
    expect(vi.mocked(api.reRenderPage)).not.toHaveBeenCalled()
  })

  it("puts a section back with no re-render when its HTML survived", async () => {
    const { result } = setup(pageDetail({ pruned: true, html: true }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(savedPruneFlags()).toEqual([false, false])
    expect(vi.mocked(api.reRenderPage)).not.toHaveBeenCalled()
  })

  it("re-renders just that section when it was removed before the storyboard ran", async () => {
    // `web-rendering` skips removed sections, so this one has no HTML at all
    // and the LLM has to produce it — one section, not the whole stage.
    const { result } = setup(pageDetail({ pruned: true, html: false }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    // Sectioning is saved with the section included *first*, so the re-render
    // actually emits it.
    expect(savedPruneFlags()).toEqual([false, false])
    expect(vi.mocked(api.reRenderPage)).toHaveBeenCalledWith(label, pageId, "sk-test", 0)
  })

  it("reports the stage as out of sync when no provider can fill the HTML", async () => {
    hasStructuredTextProvider.mockReturnValue(false)
    const { result } = setup(pageDetail({ pruned: true, html: false }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(savedInSync()).toBe(false)
    expect(vi.mocked(api.reRenderPage)).not.toHaveBeenCalled()
  })

  it("takes the completion mark back when the re-render is refused", async () => {
    // A rejected submission never reaches the runner, so leaving the stage
    // marked in-sync would claim HTML that is never going to arrive.
    vi.mocked(api.reRenderPage).mockRejectedValue(new Error("no credentials"))
    const { result } = setup(pageDetail({ pruned: true, html: false }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(savedInSync(0)).toBe(true)
    // The second save walks it back; the section stays in the book.
    expect(savedInSync(1)).toBe(false)
    expect(savedPruneFlags(1)).toEqual([false, false])
  })

  it("fetches the page when the cache has no detail for it", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    vi.mocked(api.getPage).mockResolvedValue(pageDetail({ pruned: false, html: true }))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useTogglePrune(label), { wrapper })
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(vi.mocked(api.getPage)).toHaveBeenCalledWith(label, pageId)
    expect(savedPruneFlags()).toEqual([true, false])
  })

  it("refreshes the reading order, because book page numbers shift", async () => {
    // The bug this closes: removing a page and adding it back left the sidebar
    // showing stale positions until an unrelated move forced a refetch.
    const { result, invalidateQueries } = setup(pageDetail({ pruned: false, html: true }))
    result.current.mutate({ pageId, sectionIndex: 0 })

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: readingOrderKey(label) })
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["books", label, "pages", pageId],
    })
  })
})
