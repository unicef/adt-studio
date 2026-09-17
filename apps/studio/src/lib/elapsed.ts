import { useEffect, useRef, useState } from "react"

export type ElapsedPhase = "idle" | "running" | "done" | "error"

export function formatElapsed(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function useElapsed(status: ElapsedPhase): number {
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
