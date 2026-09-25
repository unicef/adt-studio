// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReviewerPageValidationRecord } from "@adt/types"
import { useSaveReviewerPageValidationRecord } from "./use-reviewer-validation"

const save = vi.fn()
vi.mock("@/api/client", () => ({ api: { saveReviewerPageValidationRecord: (...args: unknown[]) => save(...args) } }))
afterEach(cleanup)

it("publishes a saved review only into caches matching its session, page and language", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const record: ReviewerPageValidationRecord = { session_id: "a", page_id: "pg001", language: "en", href: "section.html", results: [{ criterion_id: "reading", status: "needs-changes" }] }
  const scopes = [
    { sessionId: "a" },
    { sessionId: "a", pageId: "pg001", language: "en" },
    { sessionId: "b", pageId: "pg001" },
    { sessionId: "a", pageId: "pg002" },
    { sessionId: "a", language: "fr" },
  ]
  const keys = scopes.map((params) => ["validation", "page-results", "book", params])
  for (const key of keys) client.setQueryData(key, { records: [] })
  save.mockResolvedValueOnce({ version: 1, record })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useSaveReviewerPageValidationRecord("book"), { wrapper })
  await act(async () => { await hook.result.current.mutateAsync(record) })
  for (const key of keys.slice(0, 2)) expect(client.getQueryData(key)).toEqual({ records: [{ version: 1, record }] })
  for (const key of keys.slice(2)) expect(client.getQueryData(key)).toEqual({ records: [] })
  expect(save).toHaveBeenCalledTimes(1)
  client.clear()
})
