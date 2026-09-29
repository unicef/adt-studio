import { useEffect, useRef, useState } from "react"

export type ElapsedPhase = "idle" | "running" | "done" | "error"

export function formatElapsed(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * Time since a run began, ticking while it runs. `startedAt` is the run's own start when it is
 * known — a page that picks a run up after a reload counts from there instead of from 0:00.
 */
export function useElapsed(status: ElapsedPhase, startedAt: string | null = null): number {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const known = startedAt === null ? Number.NaN : Date.parse(startedAt)

  useEffect(() => {
    if (status !== "running") {
      if (status === "idle") {
        startedAtRef.current = null
        setElapsedMs(0)
      }
      return
    }

    if (Number.isFinite(known)) startedAtRef.current = known
    else if (startedAtRef.current === null) startedAtRef.current = Date.now()
    const tick = () => {
      if (startedAtRef.current !== null) setElapsedMs(Date.now() - startedAtRef.current)
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [status, known])

  return elapsedMs
}
