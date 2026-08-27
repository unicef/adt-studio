import { useEffect, useRef, useState } from "react"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"

export function formatElapsed(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/** Wall-clock for the run: starts when work starts, freezes when it settles. A
 *  loader that shows real elapsed time is the honest way to make a wait bearable. */
export function useElapsed(status: ProvisionStatus): number {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status !== "running") {
      if (status === "idle") {
        startedAtRef.current = null
        setElapsedMs(0)
      }
      return
    }

    if (startedAtRef.current === null) startedAtRef.current = performance.now()
    const timer = setInterval(() => {
      if (startedAtRef.current !== null) setElapsedMs(performance.now() - startedAtRef.current)
    }, 250)
    return () => clearInterval(timer)
  }, [status])

  return elapsedMs
}
