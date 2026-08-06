// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { BookPublicationStatus, PublishComment } from "@/api/client"

const getBookPublication = vi.fn()
const getPublicationComments = vi.fn()

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
  api: { getBookPublication, getPublicationComments },
  ApiError: MockApiError,
  apiErrorCode: (error: unknown) => (error instanceof MockApiError ? error.code : null),
}))

const { useFeedbackBadge } = await import("./use-feedback-badge")

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"

function status(overrides: Partial<BookPublicationStatus>): BookPublicationStatus {
  return {
    connected: true,
    worker_reachable: true,
    has_access_code: false,
    url: null,
    publication: null,
    record: null,
    ...overrides,
  }
}

function publishedRecord(): BookPublicationStatus["record"] {
  return {
    token: TOKEN,
    base_url: `https://adt-publish.example.workers.dev/p/${TOKEN}/`,
    worker_url: "https://adt-publish.example.workers.dev",
    created_at: "2026-08-01T10:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    versions: [{ version: 1, published_at: "2026-08-01T10:00:00.000Z", page_count: 1 }],
    access_code: null,
    has_access_code: false,
  }
}

function comment(overrides: Partial<PublishComment> & { id: string }): PublishComment {
  return {
    token: TOKEN,
    version: 1,
    page_section_id: "pg001_sec001",
    parent_id: null,
    session_id: "session-1",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "Look at this",
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  getPublicationComments.mockResolvedValue({ comments: [], session: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("useFeedbackBadge", () => {
  it("never asks the worker for comments on a book that was not published", async () => {
    getBookPublication.mockResolvedValue(status({ record: null }))
    const { result } = renderHook(() => useFeedbackBadge("raven"), { wrapper })

    await waitFor(() => {
      expect(result.current.published).toBe(false)
    })
    expect(getPublicationComments).not.toHaveBeenCalled()
    expect(result.current.loaded).toBe(false)
  })

  it("skips the fetch when Cloudflare is not connected", async () => {
    getBookPublication.mockResolvedValue(
      status({ connected: false, record: publishedRecord() }),
    )
    const { result } = renderHook(() => useFeedbackBadge("raven"), { wrapper })

    await waitFor(() => {
      expect(result.current.published).toBe(true)
    })
    expect(getPublicationComments).not.toHaveBeenCalled()
  })

  it("counts only the open roots once the list answers", async () => {
    getBookPublication.mockResolvedValue(status({ record: publishedRecord() }))
    getPublicationComments.mockResolvedValue({
      comments: [
        comment({ id: "open-1" }),
        comment({ id: "open-2" }),
        comment({ id: "reply", parent_id: "open-1" }),
        comment({ id: "closed", resolved_at: "2026-08-04T11:00:00.000Z" }),
      ],
      session: null,
    })
    const { result } = renderHook(() => useFeedbackBadge("raven"), { wrapper })

    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.unresolvedCount).toBe(2)
    expect(getPublicationComments).toHaveBeenCalledWith("raven", { includeResolved: true })
  })
})
