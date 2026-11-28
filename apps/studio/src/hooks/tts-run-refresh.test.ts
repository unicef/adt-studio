import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { createTtsRunRefresh } from "./tts-run-refresh"

const key = ["books", "book", "tts"]

/** A GET /tts stand-in that answers after `responseMs` with the number of
 * items generated when it was sent, and ignores cancellation like a response
 * the server is already producing. */
function setup(responseMs: number, { observed = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(key, 0)
  const stats = { generated: 0, inFlight: 0, peak: 0, starts: [] as number[], ends: [] as number[] }
  const read = vi.fn(async () => {
    const sent = stats.generated
    stats.starts.push(Date.now())
    stats.peak = Math.max(stats.peak, ++stats.inFlight)
    await new Promise(resolve => setTimeout(resolve, responseMs))
    stats.inFlight--
    stats.ends.push(Date.now())
    return sent
  })
  const stop = observed ? new QueryObserver(client, { queryKey: key, queryFn: read }).subscribe(() => {}) : () => {}
  const refresh = createTtsRunRefresh(client, "book")
  return { client, read, stats, refresh, close: () => { refresh.reset(); stop(); client.clear() } }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it("starts one request for a burst of events, then one more for what arrived meanwhile", async () => {
  const { client, read, stats, refresh, close } = setup(300)
  try {
    for (stats.generated = 1; stats.generated <= 25; stats.generated++) refresh.request()
    stats.generated = 25
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    // The first read was sent after the first event only.
    expect(client.getQueryData(key)).toBe(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(read).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(key)).toBe(25)
    expect(stats.peak).toBe(1)
  } finally { close() }
})

it.each([50, 500, 6000])("keeps one request in flight and 2 s between requests when the API answers in %i ms", async (responseMs) => {
  const { client, stats, refresh, close } = setup(responseMs)
  try {
    // One event every 200 ms for a minute, as a busy speech run sends them.
    for (let elapsed = 0; elapsed < 60_000; elapsed += 200) {
      stats.generated++
      refresh.request()
      await vi.advanceTimersByTimeAsync(200)
    }
    await vi.advanceTimersByTimeAsync(responseMs + 2000 + responseMs)
    expect(stats.peak).toBe(1)
    expect(stats.starts.length).toBeGreaterThan(1)
    for (let i = 1; i < stats.starts.length; i++) expect(stats.starts[i] - stats.ends[i - 1]).toBeGreaterThanOrEqual(2000)
    // The last event is never dropped.
    expect(client.getQueryData(key)).toBe(stats.generated)
  } finally { close() }
})

it("joins a read that is already in flight and reads once more after it", async () => {
  const { client, read, stats, refresh, close } = setup(300)
  try {
    void client.refetchQueries({ queryKey: key })
    expect(read).toHaveBeenCalledTimes(1)
    stats.generated = 1
    refresh.request()
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(client.getQueryData(key)).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(read).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(key)).toBe(1)
  } finally { close() }
})

it("drops the pending read at a run boundary and leads again in the next run", async () => {
  const { read, refresh, close } = setup(300)
  try {
    refresh.request()
    refresh.request()
    await vi.advanceTimersByTimeAsync(300)
    refresh.reset()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(read).toHaveBeenCalledTimes(1)
    refresh.request()
    expect(read).toHaveBeenCalledTimes(2)
  } finally { close() }
})

it("marks unobserved speech data stale without requesting it", async () => {
  const { client, read, refresh, close } = setup(300, { observed: false })
  try {
    refresh.request()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(read).not.toHaveBeenCalled()
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  } finally { close() }
})
