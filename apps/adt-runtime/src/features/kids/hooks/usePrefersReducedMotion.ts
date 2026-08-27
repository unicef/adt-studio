import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

export function usePrefersReducedMotion() {
  const manualReduceMotion = useAtomValue(reduceMotionAtom)
  const [osReduceMotion, setOsReduceMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return

    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setOsReduceMotion(query.matches)

    const onChange = (event: MediaQueryListEvent) => {
      setOsReduceMotion(event.matches)
    }

    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return manualReduceMotion || osReduceMotion
}
