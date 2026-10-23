import { useCallback, useSyncExternalStore } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { api, apiErrorCode } from "@/api/client"
import { bookPublicationKey } from "./use-book-publication"
import { notifyPublishRunStarted } from "./use-publish-run-notice"
import { publicationsKey } from "./use-publications"

export type HostUpdateState = "queued" | "updating" | "failed"

interface Store {
  queue: string[]
  current: string | null
  failed: Set<string>
  /** How many the current batch started with, for "2 of 5". */
  batch: number
  finished: number
}

/**
 * Updates run one book at a time, from a queue that outlives the page.
 *
 * One at a time because each update exports the whole book on this computer and uploads it; five
 * at once would crowd the disk and the connection for no gain. Module-level rather than component
 * state because leaving the dashboard must not quietly drop the books still waiting — the run on
 * the server never depended on the page, and neither should the queue.
 */
let store: Store = { queue: [], current: null, failed: new Set(), batch: 0, finished: 0 }
const listeners = new Set<() => void>()
const emit = (next: Store) => {
  store = next
  for (const listen of listeners) listen()
}
const subscribe = (listen: () => void) => {
  listeners.add(listen)
  return () => listeners.delete(listen)
}

async function runOne(label: string): Promise<boolean> {
  notifyPublishRunStarted(label)
  let failed = false
  try {
    await api.publishBookVersion(label, {
      onEvent: (event) => {
        if (event.type === "error") failed = true
      },
    })
  } catch (error) {
    /** Already running — another window or a reload started it. That run is this update. */
    failed = apiErrorCode(error) !== "publish_in_progress"
  }
  return !failed
}

async function drain(queryClient: QueryClient): Promise<void> {
  if (store.current !== null) return
  while (store.queue.length > 0) {
    const [label, ...rest] = store.queue
    emit({ ...store, queue: rest, current: label })
    const ok = await runOne(label)
    const failed = new Set(store.failed)
    if (ok) failed.delete(label)
    else failed.add(label)
    emit({ ...store, current: null, failed, finished: store.finished + 1 })
    void queryClient.invalidateQueries({ queryKey: publicationsKey })
    void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
  }
  emit({ ...store, batch: 0, finished: 0 })
}

export function useHostUpdates() {
  const queryClient = useQueryClient()
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store)

  const update = useCallback(
    (labels: string[]) => {
      const fresh = labels.filter((label) => label !== store.current && !store.queue.includes(label))
      if (fresh.length === 0) return
      const failed = new Set(store.failed)
      for (const label of fresh) failed.delete(label)
      const idle = store.current === null && store.queue.length === 0
      emit({
        ...store,
        queue: [...store.queue, ...fresh],
        failed,
        batch: idle ? fresh.length : store.batch + fresh.length,
        finished: idle ? 0 : store.finished,
      })
      void drain(queryClient)
    },
    [queryClient],
  )

  const stateOf = useCallback(
    (label: string): HostUpdateState | null =>
      snapshot.current === label
        ? "updating"
        : snapshot.queue.includes(label)
          ? "queued"
          : snapshot.failed.has(label)
            ? "failed"
            : null,
    [snapshot],
  )

  return {
    update,
    stateOf,
    running: snapshot.current !== null,
    progress: { done: snapshot.finished, total: snapshot.batch },
  }
}
