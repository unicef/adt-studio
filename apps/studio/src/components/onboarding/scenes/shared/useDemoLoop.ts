import { useEffect, useRef, useState } from "react"
import { prefersReducedMotion } from "@/lib/utils"

/**
 * Cycles through `phases` on a loop, dwelling for `durations[phase]` ms on each.
 * `durations` is read through a ref so passing a fresh array literal each render
 * does not restart the loop. Honors reduced-motion by parking on the result
 * phase. Drives the auto-playing cursor demos.
 */
export function useDemoLoop(phases: number, durations: number[]): number {
  const [phase, setPhase] = useState(0)
  const durRef = useRef(durations)
  durRef.current = durations

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase(Math.min(2, phases - 1))
      return
    }
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        i = (i + 1) % phases
        setPhase(i)
        schedule()
      }, durRef.current[i] ?? 1000)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [phases])

  return phase
}
