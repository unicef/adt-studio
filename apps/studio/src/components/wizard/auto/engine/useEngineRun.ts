import { useEffect, useState } from "react"
import type { SetupRecommendation } from "@adt/types"
import { useEngineClient } from "./client"
import { classifySetupError, type SetupFailure } from "../errors/failure"

/** After this long the screens may say the answer is slow; the engine's median is about 6.5 s (gpt-5.4-mini). */
const ENGINE_SLOW_AFTER_MS = 12000

export type EngineRun =
  | { status: "idle"; slow: false }
  | { status: "running"; slow: boolean; startedAt: number }
  | { status: "done"; rec: SetupRecommendation; slow: false }
  | { status: "failed"; failure: SetupFailure; slow: false }

/**
 * Runs the engine on a PDF. A new `attempt` starts again (Try again); a new file, leaving the
 * screen or `file = null` aborts the run in flight, so a late answer never lands on the wrong book.
 * Failures come sorted (auth / quota / offline / unknown) for `SetupError`.
 */
/** `settle` runs the state change when the answer (or a failure) comes in: the flow passes its morph there. */
export function useEngineRun(file: File | null | undefined, attempt = 0, settle: (update: () => void) => void = (u) => u()): EngineRun {
  const engine = useEngineClient()
  const [run, setRun] = useState<EngineRun>({ status: "idle", slow: false })
  useEffect(() => {
    if (!file) {
      setRun({ status: "idle", slow: false })
      return
    }
    const controller = new AbortController()
    setRun({ status: "running", slow: false, startedAt: performance.now() })
    const slow = window.setTimeout(() => setRun((r) => (r.status === "running" ? { ...r, slow: true } : r)), ENGINE_SLOW_AFTER_MS)
    engine.recommend(file, controller.signal).then(
      (rec) => !controller.signal.aborted && settle(() => setRun({ status: "done", rec, slow: false })),
      (error: unknown) => !controller.signal.aborted && settle(() => setRun({ status: "failed", failure: classifySetupError(error), slow: false })),
    )
    return () => {
      controller.abort()
      window.clearTimeout(slow)
    }
    // One run per file and attempt; the engine client changes only with the API key.
  }, [file, attempt])
  return run
}
