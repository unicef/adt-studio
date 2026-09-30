import { useEffect, useRef, useState } from "react"
import { prefersReducedMotion } from "@/lib/utils"

/**
 * Plays through `phases` exactly once (0 → phases-1), dwelling `durations[i]` ms
 * on phase i before advancing, then STOPS on the final phase — no looping, so
 * each demo has a clear ending. Reduced-motion jumps straight to the final phase.
 * Re-runs when the component remounts (e.g. the audit "Replay" button).
 */
export function useDemoLoop(phases: number, durations: number[]): number {
  const [phase, setPhase] = useState(0)
  const durRef = useRef(durations)
  durRef.current = durations

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase(phases - 1)
      return
    }
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      timer = setTimeout(() => {
        i += 1
        setPhase(i)
        if (i < phases - 1) step()
      }, durRef.current[i] ?? 1000)
    }
    if (phases > 1) step()
    return () => clearTimeout(timer)
  }, [phases])

  return phase
}
