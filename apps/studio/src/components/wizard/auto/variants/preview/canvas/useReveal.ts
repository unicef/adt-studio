import { useEffect, useState } from "react"
import { useReducedEffects } from "@/lib/effects"

/**
 * The preview builds up once the answer is in: 0 the page as printed (reading), 1 how the PDF
 * stores its pages (spreads join), 2 its text layer, 3 the look. Instant with Reduce effects.
 */
export function useReveal(done: boolean): number {
  const reduced = useReducedEffects()
  const [step, setStep] = useState(done ? 3 : 0)
  useEffect(() => {
    if (!done) return setStep(0)
    if (reduced) return setStep(3)
    const ids = [
      window.setTimeout(() => setStep((s) => Math.max(s, 1)), 250),
      window.setTimeout(() => setStep((s) => Math.max(s, 2)), 900),
      window.setTimeout(() => setStep(3), 1600),
    ]
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [done, reduced])
  return step
}
