import { useRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { RegisterPhase } from "./phase-clock"
import { useSlotMetrics } from "./slot-metrics"

/**
 * The shell the register artwork sits in: one phase attribute, one resolved geometry.
 *
 * Keeping it in one place is not tidiness. The stylesheet keys everything off `data-reg-phase`,
 * and the reduced-motion switch is a single inherited custom property, so artwork that hand-rolled
 * its own root would silently opt out of both — which is exactly how a reduced-motion frame ends
 * up being a paused arbitrary keyframe nobody looked at.
 *
 * `--reg-scale` survives from the review bench, where it let the whole three-piece run play at a
 * quarter speed; the stylesheet still multiplies every duration by it, and in production it is
 * simply 1.
 */
export function RegisterFrame({
  phase,
  className,
  children,
}: {
  /** Derived from `stepStates[3]` and `run.status` — see `useRegisterPhase`. */
  phase: RegisterPhase
  className?: string
  children: (phase: RegisterPhase) => ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const metrics = useSlotMetrics(rootRef)

  return (
    <div
      ref={rootRef}
      data-reg-phase={phase}
      style={{ ...metrics, "--reg-scale": 1 } as CSSProperties}
      className={cn("pubreg-root", className)}
    >
      {children(phase)}
    </div>
  )
}
