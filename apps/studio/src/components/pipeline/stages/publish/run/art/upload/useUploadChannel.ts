import { useEffect, useRef, useState } from "react"
import { STALL_MS, clamp01 } from "./upload-common"

export interface UploadChannel {
  /** The aggregate, 0–1. The only number the artwork is allowed to read. */
  value: number
  /** True once the count has not moved for `STALL_MS`. */
  stalled: boolean
}

/**
 * The progress channel, and nothing else.
 *
 * `lastEventAt` is derived from the value itself changing rather than passed in, because the
 * meaning is the same and the source is one less prop: the wire only speaks when a file lands,
 * so a value that has not moved *is* silence. After `STALL_MS` of it the frame is tagged
 * `data-stalled` and the artwork cools — the belt keeps running, which is how an author four
 * minutes in tells "holding" from "hung".
 *
 * A `setInterval` on React state rather than a rAF loop, deliberately. This clock ticks once a
 * second and its only job is to flip an attribute; an animation loop here would be a second clock
 * running at 60Hz for no reason, and it is the ambient CSS keyframes — not this — that have to
 * survive a stall.
 *
 * Monotonicity is not enforced. The wire only ever counts up, so there is nothing to defend
 * against.
 */
export function useUploadChannel(progress: number | null): UploadChannel {
  const value = clamp01(progress ?? 0)
  const [stalled, setStalled] = useState(false)
  const lastEventAt = useRef(Date.now())
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    lastEventAt.current = Date.now()
    setStalled(false)
  }, [value])

  useEffect(() => {
    const id = window.setInterval(() => {
      setStalled(Date.now() - lastEventAt.current > STALL_MS)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return { value, stalled }
}
