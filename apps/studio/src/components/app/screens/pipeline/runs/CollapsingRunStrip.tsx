import { useEffect, useState, type ReactNode, type TransitionEvent } from "react"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { Collapsible } from "@/components/app/screens/pipeline/steps/shared/list/Collapsible"
import type { RunStageActivity } from "./useRunActivity"
import { LiveRunStrip } from "./LiveRunPanel"

type Phase = "shown" | "settling" | "collapsing" | "gone"

const SETTLE_TIMEOUT_MS = 700
const COLLAPSE_FALLBACK_MS = 1200

export function CollapsingRunStrip({ stage, outcome }: { stage: RunStageActivity; outcome?: ReactNode }) {
  const active = stage.isActive
  const [wasActive, setWasActive] = useState(active)
  const [phase, setPhase] = useState<Phase>(active ? "shown" : "gone")
  if (wasActive !== active) {
    setWasActive(active)
    setPhase(active ? "shown" : prefersReducedMotion() ? "gone" : "settling")
  }

  useEffect(() => {
    if (phase !== "settling") return
    const collapse = () => setPhase("collapsing")
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(collapse, { timeout: SETTLE_TIMEOUT_MS })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(collapse, 120)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "collapsing") return
    const timer = setTimeout(() => setPhase("gone"), COLLAPSE_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const finish = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === "grid-template-rows" && phase === "collapsing") setPhase("gone")
  }

  if (phase === "gone") return null
  return (
    <Collapsible
      open={phase !== "collapsing"}
      onTransitionEnd={finish}
      className={cn(
        "transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out motion-reduce:transition-none",
        phase === "collapsing" && "-mb-4",
      )}
    >
      <LiveRunStrip stage={stage} outcome={outcome} />
    </Collapsible>
  )
}
