import { useEffect, useState } from "react"
import type { ProvisionStepStatus } from "@/api/client"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"
import { PROVISION_STEP_COPY } from "./provision-steps"

const STEP_MS = 900

/** Walks the eight steps locally so the provisioning loader can be looked at without
 *  touching a Cloudflare account. Only ever mounted behind `import.meta.env.DEV`. */
export function useProvisionDemo() {
  const total = PROVISION_STEP_COPY.length
  const [tick, setTick] = useState<number | null>(null)
  const finished = tick !== null && tick > total

  useEffect(() => {
    if (tick === null || finished) return
    const timer = setTimeout(() => setTick((current) => (current === null ? null : current + 1)), STEP_MS)
    return () => clearTimeout(timer)
  }, [finished, tick])

  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(() => setTick(null), 2200)
    return () => clearTimeout(timer)
  }, [finished])

  const active = tick !== null

  const stepStates: ProvisionStepStatus[] = Array.from({ length: total }, (_, index) => {
    if (tick === null) return "pending"
    if (index + 1 < tick) return index === 2 ? "skipped" : "done"
    if (index + 1 === tick) return "running"
    return "pending"
  })

  return {
    active,
    status: (finished ? "done" : "running") as ProvisionStatus,
    stepStates,
    activeStep: tick !== null && tick <= total ? tick : null,
    play: () => setTick(1),
    stop: () => setTick(null),
  }
}
