// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PublicationSummary, PublicationsOverview } from "@adt/types"

const getPublications = vi.fn()

class MockApiError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

vi.mock("@/api/client", () => ({
  api: { getPublications },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
}))

const { usePublicationsByBook } = await import("./use-publications")

function summary(overrides: Partial<PublicationSummary> = {}): PublicationSummary {
  return {
    token: "TokenRavenTokenRavenTokenRaven12",
    title: "Raven and the Sun",
    book_label: "raven",
    book_exists: true,
    url: "https://adt-publish.escola.workers.dev/p/TokenRavenTokenRavenTokenRaven12/",
    current_version: 1,
    version_count: 1,
    created_at: "2026-08-01T09:00:00.000Z",
    last_published_at: "2026-08-01T09:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    has_access_code: false,
    access_code: null,
    comment_count: 0,
    unresolved_count: 0,
    snapshot_bytes: null,
    source: "worker",
    ...overrides,
  }
}

function overview(publications: PublicationSummary[], reachable = true): PublicationsOverview {
  return {
    worker_reachable: reachable,
    publications,
    totals: {
      published_count: publications.length,
      active_count: publications.length,
      total_snapshot_bytes: 0,
      snapshot_bytes_complete: false,
      total_unresolved: 0,
    },
  }
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("usePublicationsByBook", () => {
  it("keys each book's publication by its label", async () => {
    getPublications.mockResolvedValue(
      overview([summary(), summary({ token: "b".repeat(32), book_label: "moon" })]),
    )

    const { result } = renderHook(() => usePublicationsByBook(), { wrapper: harness() })

    await waitFor(() => expect(result.current.byLabel.size).toBe(2))
    expect(result.current.byLabel.get("raven")?.title).toBe("Raven and the Sun")
    expect(result.current.byLabel.get("moon")).toBeTruthy()
    expect(result.current.countsKnown).toBe(true)
  })

  it("prefers the link readers can still open when one book has two", async () => {
    const dead = summary({
      token: "d".repeat(32),
      revoked_at: "2026-08-05T09:00:00.000Z",
      last_published_at: "2026-08-05T09:00:00.000Z",
    })
    const live = summary({ token: "l".repeat(32), last_published_at: "2026-08-02T09:00:00.000Z" })

    /** Both orders, because the map must not depend on how the API happened to sort — the newer
     *  publication here is the revoked one, so "newest wins" alone would pick the dead link. */
    for (const publications of [
      [dead, live],
      [live, dead],
    ]) {
      getPublications.mockResolvedValue(overview(publications))
      const { result } = renderHook(() => usePublicationsByBook(), { wrapper: harness() })
      await waitFor(() => expect(result.current.byLabel.size).toBe(1))
      expect(result.current.byLabel.get("raven")?.token).toBe("l".repeat(32))
    }
  })

  it("falls back to the most recent when both links are stopped", async () => {
    const older = summary({
      token: "o".repeat(32),
      revoked_at: "2026-08-03T09:00:00.000Z",
      last_published_at: "2026-08-01T09:00:00.000Z",
    })
    const newer = summary({
      token: "n".repeat(32),
      revoked_at: "2026-08-05T09:00:00.000Z",
      last_published_at: "2026-08-04T09:00:00.000Z",
    })

    getPublications.mockResolvedValue(overview([older, newer]))
    const { result } = renderHook(() => usePublicationsByBook(), { wrapper: harness() })

    await waitFor(() => expect(result.current.byLabel.size).toBe(1))
    expect(result.current.byLabel.get("raven")?.token).toBe("n".repeat(32))
  })

  it("stays empty and quiet when no Cloudflare account is connected", async () => {
    getPublications.mockRejectedValue(
      new MockApiError("Connect a Cloudflare account", 412, "publish_not_connected"),
    )

    const { result } = renderHook(() => usePublicationsByBook(), { wrapper: harness() })

    await waitFor(() => expect(getPublications).toHaveBeenCalled())
    expect(result.current.byLabel.size).toBe(0)
    expect(result.current.countsKnown).toBe(false)
  })

  it("withholds the counts when the publishing service could not be reached", async () => {
    getPublications.mockResolvedValue(overview([summary({ source: "local" })], false))

    const { result } = renderHook(() => usePublicationsByBook(), { wrapper: harness() })

    await waitFor(() => expect(result.current.byLabel.size).toBe(1))
    expect(result.current.countsKnown).toBe(false)
  })
})
