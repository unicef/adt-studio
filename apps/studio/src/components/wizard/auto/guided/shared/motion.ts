import { flushSync } from "react-dom"
import { REDUCED_CLASS } from "@/lib/effects"

/**
 * Motion for Guided. State changes that move things around (a new step, a new Check screen, a
 * pick) go through `morph`, which runs them inside a View Transition: what has a
 * `view-transition-name` (the bubble, the panel, the step dot, the current screen in the list, the
 * pick) moves and resizes from its old place to its new one, and the rest crossfades. Without View
 * Transitions, or with reduced motion / Reduce effects, the change just happens (the height morph
 * in `Morph` still eases where View Transitions aren't there).
 */
export const hasViewTransitions = typeof document !== "undefined" && "startViewTransition" in document

export function motionOff(): boolean {
  if (typeof window === "undefined") return true
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a media query
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains(REDUCED_CLASS)
}

type ViewTransitionDoc = Document & { startViewTransition: (update: () => void) => { finished: Promise<void> } }

/** Runs `update` as a morph: the old and new states are snapshotted around it and animated between. */
export function morph(update: () => void): void {
  if (!hasViewTransitions || motionOff()) return update()
  ;(document as ViewTransitionDoc).startViewTransition(() => flushSync(update))
}

/**
 * A morph from one element: `source` (the card that was clicked) becomes the element marked
 * `data-vt-pick={name}` in the new state (the highlighted pick, which carries that
 * view-transition-name). While the old state is captured, the old holder of the name sits out and
 * the card takes the name.
 */
export function morphFrom(source: HTMLElement | null, name: string, update: () => void): void {
  if (!source || !hasViewTransitions || motionOff()) return morph(update)
  const holders = Array.from(document.querySelectorAll<HTMLElement>(`[data-vt-pick="${CSS.escape(name)}"]`))
  for (const h of holders) h.setAttribute("data-vt-off", "")
  const before = source.style.viewTransitionName
  source.style.viewTransitionName = name
  const vt = (document as ViewTransitionDoc).startViewTransition(() => {
    source.style.viewTransitionName = before
    for (const h of holders) h.removeAttribute("data-vt-off")
    flushSync(update)
  })
  void vt.finished.finally(() => {
    source.style.viewTransitionName = before
    for (const h of holders) h.removeAttribute("data-vt-off")
  })
}
