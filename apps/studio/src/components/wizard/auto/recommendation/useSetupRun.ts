import { useEffect, useState } from "react"
import { classifySetupError, type SetupClient, type SetupFailure } from "./client"
import type { SetupRequest, SetupResult } from "./contract"

/** After this long without an answer the loader offers a way out; tune it to the recommender's real latency. */
export const SLOW_AFTER_MS = 5000

export type SetupRun = { status: "running" | "done" | "failed"; result?: SetupResult; failure?: SetupFailure; slow: boolean }

/**
 * Runs one setup request. A new `key` starts a fresh run (Try again); leaving the screen or starting
 * over aborts the one in flight, so a late answer never lands on the wrong book.
 */
export function useSetupRun(client: SetupClient, request: SetupRequest | null, key: number): SetupRun {
  const [run, setRun] = useState<SetupRun>({ status: "running", slow: false })
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    setRun({ status: "running", slow: false })
    const slow = window.setTimeout(() => setRun((r) => (r.status === "running" ? { ...r, slow: true } : r)), SLOW_AFTER_MS)
    client.recommend(request, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setRun({ status: "done", result, slow: false })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setRun({ status: "failed", failure: classifySetupError(error), slow: false })
      },
    )
    return () => {
      controller.abort()
      window.clearTimeout(slow)
    }
  }, [key, request?.file, request?.userLanguage, request?.pages?.start, request?.pages?.end])
  return run
}
