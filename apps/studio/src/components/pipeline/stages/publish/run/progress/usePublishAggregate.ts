import { useEffect, useRef, useState } from "react"
import type { BookPublishRunController } from "@/hooks/use-book-publication"
import { AGGREGATE_COALESCE_MS, aggregatePercent, publishAggregate } from "./publish-aggregate"

export interface PublishAggregate {
  /** 0–1, monotonic for the life of one run. */
  value: number
  /** The same thing as an integer, which is what `aria-valuenow` reports. */
  percent: number
}

/**
 * The aggregate on a clock instead of on the event stream.
 *
 * Two reasons it is driven by an interval rather than recomputed per render. The uncounted steps
 * need a value that keeps moving while nothing at all arrives from the server — that is the whole
 * point of the time model — and the counted one arrives far too often: one event per file means
 * 340 of them, and 340 renders of a bar that moves a third of a pixel each time is how a progress
 * display ends up costing more than the upload it is describing.
 *
 * The 200ms window also enforces §3.8's motion ceiling for free: nothing downstream can flip state
 * more than five times a second, however chatty the wire gets.
 */
export function usePublishAggregate(run: BookPublishRunController): PublishAggregate {
  const [value, setValue] = useState(0)
  const valueRef = useRef(0)
  const runRef = useRef(run)
  const stepStartRef = useRef(0)
  const wasRunningRef = useRef(false)

  const runningIndex = run.stepStates.findIndex((state) => state === "running")

  useEffect(() => {
    runRef.current = run
  })

  /* A retry is a new run, not a continuation of the failed one, so the monotonic clamp has to be
     released exactly here — otherwise the second attempt opens at the percentage the first one
     died at and appears to skip the work it is about to redo. */
  useEffect(() => {
    const running = run.status === "running"
    if (running && !wasRunningRef.current) {
      valueRef.current = 0
      setValue(0)
      stepStartRef.current = performance.now()
    }
    wasRunningRef.current = running
  }, [run.status])

  /* Moving *backwards* through the steps releases the clamp as well. A real run never does this
     — which is why the clamp is safe in production — but the bench scrubs, and a held maximum
     from a later step is what produced "0 of 340 files" underneath a 95% bar: the count came from
     the step you scrubbed to and the bar from the one you left. */
  const previousIndexRef = useRef(runningIndex)
  useEffect(() => {
    stepStartRef.current = performance.now()
    if (runningIndex !== -1 && runningIndex < previousIndexRef.current) {
      valueRef.current = 0
      setValue(0)
    }
    previousIndexRef.current = runningIndex
  }, [runningIndex])

  useEffect(() => {
    if (run.status !== "running") return

    const settle = () => {
      const current = runRef.current
      const next = publishAggregate({
        status: current.status,
        stepStates: current.stepStates,
        progress: current.progress,
        stepElapsedMs: performance.now() - stepStartRef.current,
        previous: valueRef.current,
      })
      if (next === valueRef.current) return
      valueRef.current = next
      setValue(next)
    }

    settle()
    const timer = setInterval(settle, AGGREGATE_COALESCE_MS)
    return () => clearInterval(timer)
  }, [run.status])

  /* Finishing is the one jump the value is allowed to make: the last `register` event and the
     stream closing arrive together, and leaving the bar at 96% under the words "your book is
     online" is the kind of small lie that costs more trust than the three minutes before it. */
  useEffect(() => {
    if (run.status !== "done") return
    valueRef.current = 1
    setValue(1)
  }, [run.status])

  return { value, percent: aggregatePercent(value) }
}
