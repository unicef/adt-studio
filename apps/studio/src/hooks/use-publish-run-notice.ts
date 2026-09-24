import { useEffect, useSyncExternalStore } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { api, type BookDetail } from "@/api/client"
import { bookPublicationKey } from "./use-book-publication"

const POLL_MS = 2000

/** How many Sharing pages are open for each book. A run is worth announcing only when nobody is
 *  looking at the page it would have finished on. */
const watchers = new Map<string, number>()

export function usePublishScreenPresence(label: string): void {
  useEffect(() => {
    watchers.set(label, (watchers.get(label) ?? 0) + 1)
    return () => {
      const next = (watchers.get(label) ?? 1) - 1
      if (next <= 0) watchers.delete(label)
      else watchers.set(label, next)
    }
  }, [label])
}

function unattended(label: string): boolean {
  return !watchers.has(label) || document.hidden
}

/** Books with a run this session saw running. Only those are announced: the server keeps each
 *  book's last ending, and a finished share must not greet every later page load with a toast. */
const watched = new Set<string>()
const listeners = new Set<() => void>()

export function notifyPublishRunStarted(label: string): void {
  watched.add(label)
  setRunning(label, true)
  for (const listen of listeners) listen()
}

/** Books whose share is running right now, as the follower below last saw them — so the book
 *  rail can show the Sharing entry working while the author is on another stage. */
const running = new Set<string>()
const runningListeners = new Set<() => void>()

function setRunning(label: string, on: boolean) {
  if (running.has(label) === on) return
  if (on) running.add(label)
  else running.delete(label)
  for (const listen of runningListeners) listen()
}

function subscribeRunning(listener: () => void) {
  runningListeners.add(listener)
  return () => {
    runningListeners.delete(listener)
  }
}

export function useShareRunning(label: string): boolean {
  return useSyncExternalStore(subscribeRunning, () => running.has(label))
}

/**
 * Follows every share run to its end, wherever the author is, and says how it went when they
 * are not on that book's Sharing page.
 *
 * A share takes minutes and carries on on the server after the page that started it is gone —
 * reloaded, or left for another stage. Without this the author learns the outcome only by going
 * back and looking.
 */
export function usePublishRunNotice(): void {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let polling = false

    const titleOf = (label: string, fallback?: string) =>
      queryClient.getQueryData<BookDetail>(["books", label])?.title ?? fallback ?? label

    const poll = async () => {
      if (cancelled) return
      polling = true
      try {
        for (const label of [...watched]) {
          const { run } = await api.getPublishRun(label)
          if (cancelled) return
          if (run?.status === "running") {
            setRunning(label, true)
            continue
          }
          setRunning(label, false)
          if (!run) continue

          watched.delete(label)
          void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
          if (run.status === "cancelled" || !unattended(label)) continue

          const title = titleOf(label, run.result?.publication.title)
          if (run.status === "done") {
            toast.success(
              run.kind === "update" ? t`“${title}” is updated for readers` : t`“${title}” is shared`,
              { description: t`Its link is on the book's Sharing page.` },
            )
          } else {
            toast.error(t`Sharing “${title}” didn't finish`, {
              description: t`Nothing reached readers. Open the book's Sharing page to try again.`,
            })
          }
        }
      } catch {
        /* a missed read just means a later toast; the page itself still tells the story */
      } finally {
        polling = false
      }
      if (!cancelled && watched.size > 0) timer = window.setTimeout(() => void poll(), POLL_MS)
    }

    /** One read on open catches runs a reload left behind, on whatever page the app opened. */
    void api
      .listPublishRuns()
      .then(({ runs }) => {
        for (const entry of runs) {
          watched.add(entry.label)
          if (entry.run.status === "running") setRunning(entry.label, true)
        }
        if (watched.size > 0 && !polling) void poll()
      })
      .catch(() => {})

    /** A new run skips the wait for the next tick, so a short one is not missed between them. */
    const wake = () => {
      if (polling) return
      if (timer !== undefined) window.clearTimeout(timer)
      void poll()
    }
    listeners.add(wake)
    return () => {
      cancelled = true
      listeners.delete(wake)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [t, queryClient])
}
