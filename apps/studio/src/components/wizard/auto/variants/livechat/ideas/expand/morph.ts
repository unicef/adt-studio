import { useCallback, type CSSProperties } from "react"
import { flushSync } from "react-dom"
import { useReducedEffects } from "@/lib/effects"
import "./expand.css"

type ViewTransitionDoc = Document & { startViewTransition?: (update: (() => void) | { update: () => void; types: string[] }) => { finished: Promise<void> } }

/**
 * Runs a state change as a morph (b6): with the View Transitions API, a surface that keeps its
 * `view-transition-name` across the change grows or shrinks from its old box into its new one, so
 * the folded line and its open panel read as one object. With Reduce effects, reduced motion or no
 * API, the change just happens.
 */
export function useMorph() {
  const reduced = useReducedEffects()
  return useCallback(
    (update: () => void) => {
      const doc = document as ViewTransitionDoc
      if (reduced || !doc.startViewTransition) return update()
      doc.startViewTransition({ update: () => flushSync(update), types: ["ix"] })
    },
    [reduced],
  )
}

/** The style that ties an element to a morph: the same name before and after is the same object. */
export const morphName = (name: string) => ({ viewTransitionName: name.replace(/[^a-z0-9-]/gi, "-"), viewTransitionClass: "ix" }) as CSSProperties
