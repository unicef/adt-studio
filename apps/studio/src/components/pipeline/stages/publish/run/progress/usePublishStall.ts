import { useEffect, useRef, useState } from "react"
import type { BookPublishRunController } from "@/hooks/use-book-publication"

/** Long enough that a big page is not called a stall; short enough to answer the question before
 *  the author starts looking for the close button. */
export const STALL_HINT_MS = 30_000
/** Two minutes of one step saying nothing. Still not an error — the run is untouched — but by now
 *  the useful thing to make obvious is the way out. */
export const STALL_ESCALATE_MS = 120_000

export type PublishStall = "moving" | "quiet" | "long"

/**
 * How long the running step has been silent.
 *
 * Deliberately measured from *observable change*, not from the SSE connection: the wire can be
 * perfectly healthy while a single 40MB video takes ninety seconds to reach Cloudflare, and from
 * where the author sits those two situations look identical. Saying "still working" is honest in
 * both, and saying "failed" would be wrong in both.
 *
 * `override` exists for the bench, which cannot wait two real minutes to look at the two-minute
 * state.
 */
export function usePublishStall(
  run: BookPublishRunController,
  override?: number | null,
): { stall: PublishStall; silentMs: number } {
  const [silentMs, setSilentMs] = useState(0)
  const lastChangeRef = useRef(0)

  const runningIndex = run.stepStates.findIndex((state) => state === "running")
  const done = run.progress?.done ?? null

  useEffect(() => {
    lastChangeRef.current = performance.now()
    setSilentMs(0)
  }, [runningIndex, done, run.status])

  useEffect(() => {
    if (run.status !== "running") return
    const timer = setInterval(() => {
      setSilentMs(performance.now() - lastChangeRef.current)
    }, 1_000)
    return () => clearInterval(timer)
  }, [run.status])

  const effective = override ?? silentMs
  const stall: PublishStall =
    run.status !== "running"
      ? "moving"
      : effective >= STALL_ESCALATE_MS
        ? "long"
        : effective >= STALL_HINT_MS
          ? "quiet"
          : "moving"

  return { stall, silentMs: effective }
}
