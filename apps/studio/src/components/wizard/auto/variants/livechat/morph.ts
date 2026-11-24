import { useCallback } from "react"
import { flushSync } from "react-dom"
import { useReducedEffects } from "@/lib/effects"

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }

/**
 * Runs a state change as a morph: with the View Transitions API, every surface that keeps its
 * `view-transition-name` across the change grows or shrinks from its old box into its new one, so a
 * bubble and its stage read as the same object. With Reduce effects, reduced motion or no API, the
 * change just happens.
 */
export function useMorph() {
  const reduced = useReducedEffects()
  return useCallback(
    (update: () => void) => {
      const doc = document as ViewTransitionDoc
      if (reduced || !doc.startViewTransition) return update()
      doc.startViewTransition(() => flushSync(update))
    },
    [reduced],
  )
}

/** The style that ties an element to a morph: the same name before and after is the same object. */
export const morphName = (name: string) => ({ viewTransitionName: name, viewTransitionClass: "lc" }) as React.CSSProperties
