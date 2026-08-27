import { useEffect, useRef, useState } from "react"
import { STALL_MS, clamp01 } from "./upload-common"

export interface UploadChannel {
  /** The aggregate, 0–1. The only number any of the three variants is allowed to read. */
  value: number
  /** True once the count has not moved for `STALL_MS`. */
  stalled: boolean
  /** Flips 0/1 on every change, so a component can retrigger a CSS animation by swapping its
   *  `animation-name` rather than remounting the node — remounting would throw away decoded
   *  images 340 times over a four-minute upload. */
  arrivalPhase: 0 | 1
}

/**
 * The progress channel, and nothing else.
 *
 * The spec's plumbing is a `lastEventAt` from the publish hook plus a 1s `setInterval` that sets
 * `data-stalled` after 15s of silence. There are no real events on the bench — the gallery drives
 * `progress` from a slider — so `lastEventAt` is derived from the value itself changing. That is
 * the same signal with the same meaning, and it makes the stalled state reachable the way it will
 * actually be reached in production: by nothing happening. Leave the slider alone for fifteen
 * seconds and the artwork says so.
 *
 * A `setInterval` on React state rather than a rAF loop, deliberately. This clock ticks once a
 * second and its only job is to flip an attribute; an animation loop here would be a second clock
 * running at 60Hz for no reason, and it is the ambient CSS keyframes — not this — that have to
 * survive a stall.
 *
 * Monotonicity is not enforced. The wire only ever counts up, so there is nothing to defend
 * against, and clamping it would make the gallery's slider one-way.
 */
export function useUploadChannel(progress: number | null): UploadChannel {
  const value = clamp01(progress ?? 0)
  const [stalled, setStalled] = useState(false)
  const [arrivals, setArrivals] = useState(0)
  const lastEventAt = useRef(Date.now())
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    lastEventAt.current = Date.now()
    setStalled(false)
    setArrivals((count) => count + 1)
  }, [value])

  useEffect(() => {
    const id = window.setInterval(() => {
      setStalled(Date.now() - lastEventAt.current > STALL_MS)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return { value, stalled, arrivalPhase: (arrivals % 2) as 0 | 1 }
}
