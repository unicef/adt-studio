import type { QueryClient } from "@tanstack/react-query"

/** One GET /tts at a time during a speech run: a read on the first event, then
 * at most one more per interval, counted from when the previous read settled.
 * Events in between share that single trailing read, so neither a burst of
 * item errors nor a slow API can pile up requests. */
export function createTtsRunRefresh(client: QueryClient, label: string, intervalMs = 2000) {
  const tts = { queryKey: ["books", label, "tts"] }
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastSettled = -Infinity
  let running = false, dirty = false
  const schedule = () => {
    if (running || !dirty || timer) return
    const delay = Math.max(0, intervalMs - (Date.now() - lastSettled))
    if (delay) timer = setTimeout(() => { timer = undefined; void refresh() }, delay)
    else void refresh()
  }
  const refresh = async () => {
    running = true; dirty = false
    try {
      // A read that is already under way may predate this event. Join it
      // instead of starting a second request, then read once more after it.
      if (client.isFetching(tts) > 0) dirty = true
      await client.invalidateQueries(tts, { cancelRefetch: false })
    } finally {
      running = false; lastSettled = Date.now()
      schedule()
    }
  }
  return {
    request() { dirty = true; schedule() },
    /** Run boundary: drop the pending read. The run-end refresh of the book's
     * queries is the final one, and nothing may follow it. */
    reset() {
      dirty = false
      if (timer) clearTimeout(timer)
      timer = undefined
    },
  }
}
