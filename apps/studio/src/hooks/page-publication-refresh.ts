import type { QueryClient } from "@tanstack/react-query"

/** One leading read and a bounded trailing read for committed page bursts.
 * Once a fresh read starts, let it finish; repeatedly cancelling slow reads
 * prevents the UI from ever seeing a publication. */
export function createPagePublicationRefresh(client: QueryClient, label: string, intervalMs = 2000) {
  const pages = { queryKey: ["books", label, "pages"] }
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastStarted = -Infinity, epoch = 0
  let running = false, dirty = false, first = true, disposed = false
  const schedule = () => {
    if (disposed || running || !dirty || timer) return
    const delay = Math.max(0, intervalMs - (Date.now() - lastStarted))
    if (delay) timer = setTimeout(() => { timer = undefined; void refresh() }, delay)
    else void refresh()
  }
  const refresh = async () => {
    if (disposed || running || !dirty) return
    const startedEpoch = epoch
    running = true; dirty = false; lastStarted = Date.now()
    try {
      if (first) {
        first = false
        // The first publication must supersede even an initial pre-run read.
        await client.cancelQueries(pages)
      } else {
        // A newly mounted page may have started an empty read before this batch.
        await client.cancelQueries({ ...pages, predicate: query => query.state.data === undefined })
        if (disposed || epoch !== startedEpoch) return
        // Reusing an already-running populated read is safe only with a fresh
        // trailing read after it settles, even if this is the final publication.
        if (client.getQueryCache().findAll({ ...pages, type: "active" }).some(query => query.state.fetchStatus === "fetching")) dirty = true
      }
      if (disposed || epoch !== startedEpoch) return
      await client.invalidateQueries(pages, { cancelRefetch: false })
    } finally {
      if (disposed) void client.invalidateQueries({ ...pages, refetchType: "none" })
      if (epoch === startedEpoch) { running = false; schedule() }
    }
  }
  const reset = () => {
    epoch++; running = false; dirty = false; first = true; lastStarted = -Infinity
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  return {
    request() {
      if (disposed) return
      dirty = true
      // Inactive details must be stale before navigation, without refetching
      // every active observer for each individual page event.
      void client.invalidateQueries({ ...pages, refetchType: "none" })
      schedule()
    },
    reset,
    dispose() { reset(); disposed = true },
  }
}
