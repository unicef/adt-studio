// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SetupClient } from "./client"
import type { SetupRequest, SetupResult } from "./contract"
import { placeholderResult } from "./placeholder"
import { SLOW_AFTER_MS, useSetupRun } from "./useSetupRun"

const file = new File(["%PDF-1.7"], "volcanoes.pdf", { type: "application/pdf" })
const request: SetupRequest = { file, userLanguage: "pt-BR" }
const answer: SetupResult = placeholderResult(request, 0.7, false, 52)

function client(recommend: SetupClient["recommend"]): SetupClient {
  return { recommend: vi.fn(recommend) }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useSetupRun", () => {
  it("sends the request and returns the answer", async () => {
    const c = client(async () => answer)
    const { result } = renderHook(() => useSetupRun(c, request, 0))
    await waitFor(() => expect(result.current.status).toBe("done"))
    expect(result.current.result).toBe(answer)
    expect(c.recommend).toHaveBeenCalledWith(request, expect.any(AbortSignal))
  })

  it("sorts a failure into an error kind and keeps the provider's message", async () => {
    const c = client(async () => {
      throw Object.assign(new Error("429 You exceeded your current quota"), { status: 429 })
    })
    const { result } = renderHook(() => useSetupRun(c, request, 0))
    await waitFor(() => expect(result.current.status).toBe("failed"))
    expect(result.current.failure?.kind).toBe("quota")
    expect(result.current.failure?.detail).toMatch(/exceeded your current quota/)
  })

  it("flags a slow answer without failing it", async () => {
    vi.useFakeTimers()
    const c = client(() => new Promise<SetupResult>(() => {}))
    const { result } = renderHook(() => useSetupRun(c, request, 0))
    expect(result.current.slow).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(SLOW_AFTER_MS + 10)
    })
    expect(result.current).toMatchObject({ status: "running", slow: true })
  })

  it("aborts the run in flight when the screen goes away, so a late answer never lands", async () => {
    let signal: AbortSignal | undefined
    const c = client((_, s) => {
      signal = s
      return new Promise<SetupResult>(() => {})
    })
    const { unmount } = renderHook(() => useSetupRun(c, request, 0))
    await waitFor(() => expect(signal).toBeDefined())
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("starts a fresh run when the key changes (Try again)", async () => {
    const c = client(async () => answer)
    const { result, rerender } = renderHook(({ key }) => useSetupRun(c, request, key), { initialProps: { key: 0 } })
    await waitFor(() => expect(result.current.status).toBe("done"))
    rerender({ key: 1 })
    await waitFor(() => expect(c.recommend).toHaveBeenCalledTimes(2))
  })
})
