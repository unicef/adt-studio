import { useEffect, useRef, useState } from "react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { LoaderStepState } from "./CalmStepLoader"
import type { ProvisionRailProps } from "./ProvisionRail"

const MIN_SHOWN_DURATION_MS = 1000

export const STATE_WORD: Record<LoaderStepState, MessageDescriptor> = {
  pending: msg`not started`,
  running: msg`in progress`,
  done: msg`done`,
  error: msg`stopped here`,
  skipped: msg`already there`,
}

export function isSettled(state: LoaderStepState): boolean {
  return state === "done" || state === "skipped"
}

/** The provisioning stream carries statuses, not timings. */
export function useStepDurations(stepStates: readonly LoaderStepState[]): (number | null)[] {
  const timings = useRef<{ startedAt: number; endedAt: number | null }[]>([])
  const [, force] = useState(0)

  useEffect(() => {
    let changed = false
    stepStates.forEach((state, index) => {
      const held = timings.current[index]
      if (state === "running" && !held) {
        timings.current[index] = { startedAt: Date.now(), endedAt: null }
        changed = true
      }
      if (held && !held.endedAt && (isSettled(state) || state === "error")) {
        held.endedAt = Date.now()
        changed = true
      }
      if (state === "pending" && held) {
        delete timings.current[index]
        changed = true
      }
    })
    if (changed) force((n) => n + 1)
  }, [stepStates])

  return stepStates.map((_, index) => {
    const held = timings.current[index]
    if (!held?.endedAt) return null
    const took = held.endedAt - held.startedAt
    return took >= MIN_SHOWN_DURATION_MS ? took : null
  })
}


/** What every rail body receives. The header, the progress track and the error notice stay
 *  in `ProvisionRail`; a body only draws the seven steps. */
export interface RailBodyProps {
  steps: ProvisionRailProps["steps"]
  status: ProvisionRailProps["status"]
  stepStates: ProvisionRailProps["stepStates"]
  testIdPrefix: string
  focused: number
  finished: boolean
  failedAt: number
  durations: (number | null)[]
}
