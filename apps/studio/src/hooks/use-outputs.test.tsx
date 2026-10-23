// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { OutputStageSummaryResponse } from "@adt/types"
vi.mock("@/api/client", () => ({ api: { getOutputs: vi.fn(), getOutputSummary: vi.fn(), getOutputDisclosure: vi.fn() } }))
import { api } from "@/api/client"
import { useOutputs, useOutputSummary } from "./use-outputs"
afterEach(() => { cleanup(); vi.resetAllMocks() })
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const summary = (legacyBaselineRevision: number): OutputStageSummaryResponse => ({ legacyBaselineRevision, stages: {}, stagesWithoutMissing: {}, missingStages: [] })
const output = (current: boolean) => ({ outputs: [{ current }], missingStages: [], summary: {} }) as unknown as Awaited<ReturnType<typeof api.getOutputs>>
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => ({ detail: useOutputs("book"), sidebar: useOutputSummary("book") }), { wrapper })
  return { client, ...hook }
}
it("shares the opening summary and reads details only after the baseline is available", async () => {
  const opened = pending<OutputStageSummaryResponse>()
  vi.mocked(api.getOutputSummary).mockReturnValue(opened.promise)
  vi.mocked(api.getOutputs).mockResolvedValue(output(true))
  const hook = setup()
  expect(api.getOutputSummary).toHaveBeenCalledTimes(1)
  expect(api.getOutputs).not.toHaveBeenCalled()
  await act(async () => opened.resolve(summary(1)))
  await waitFor(() => expect(hook.result.current.detail.data?.outputs[0].current).toBe(true))
  expect(api.getOutputs).toHaveBeenCalledTimes(1)
  hook.unmount(); hook.client.clear()
})
it("supersedes a late pre-baseline response after a busy book unlocks and parallel queries refresh", async () => {
  vi.mocked(api.getOutputSummary).mockResolvedValueOnce(summary(0))
  vi.mocked(api.getOutputs).mockResolvedValueOnce(output(false))
  const hook = setup()
  await waitFor(() => expect(hook.result.current.detail.data?.outputs[0].current).toBe(false))
  const refreshed = pending<OutputStageSummaryResponse>(), oldRead = pending<Awaited<ReturnType<typeof api.getOutputs>>>()
  vi.mocked(api.getOutputSummary).mockReturnValueOnce(refreshed.promise)
  vi.mocked(api.getOutputs).mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(output(true))
  let invalidation!: Promise<void>
  act(() => { invalidation = hook.client.invalidateQueries({ queryKey: ["books", "book", "outputs"] }) })
  await waitFor(() => expect(api.getOutputs).toHaveBeenCalledTimes(2))
  await act(async () => refreshed.resolve(summary(1)))
  await waitFor(() => expect(hook.result.current.detail.data?.outputs[0].current).toBe(true))
  await act(async () => { oldRead.resolve(output(false)); await invalidation })
  expect(hook.result.current.detail.data?.outputs[0].current).toBe(true)
  expect(api.getOutputSummary).toHaveBeenCalledTimes(2)
  expect(api.getOutputs).toHaveBeenCalledTimes(3)
  hook.unmount(); hook.client.clear()
})
