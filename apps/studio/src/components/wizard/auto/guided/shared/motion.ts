import { useLayoutEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { prefersReducedMotion } from "@/lib/utils"

/**
 * Motion for Guided. State changes that move things around (a new step, a new Check screen, a
 * pick) go through `morph`, which runs them inside a View Transition: what has a
 * `view-transition-name` (the bubble, the panel, the step dot, the current screen in the list, the
 * pick) moves and resizes from its old place to its new one, and the rest crossfades. Without View
 * Transitions, or with reduced motion, the change just happens (the height morph
 * in `Morph` still eases where View Transitions aren't there).
 */
export const hasViewTransitions = typeof document !== "undefined" && "startViewTransition" in document

export function motionOff(): boolean {
  if (typeof window === "undefined") return true
  return prefersReducedMotion()
}

type ViewTransitionDoc = Document & { startViewTransition: (update: () => void) => { finished: Promise<void> } }

/** A Radix dialog is open or still closing: a snapshot of the page would carry it (half faded, its × over the page). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS selector
const DIALOG = "[role=dialog][data-state], [role=alertdialog][data-state]"

/**
 * Runs `update` as a morph: the old and new states are snapshotted around it and animated between.
 * While a dialog is on screen the change just happens (close the dialog first, then morph).
 */
export function morph(update: () => void): void {
  if (!hasViewTransitions || motionOff() || document.querySelector(DIALOG)) return update()
  ;(document as ViewTransitionDoc).startViewTransition(() => flushSync(update))
}

/**
 * A view-transition name for words that change in place: one name per text, so words that stay
 * the same keep their name (and just move), while new words enter and the old ones leave
 * (the `.gd-swap` animations in guided.css).
 */
export function swapName(prefix: string, text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${prefix}-${(h >>> 0).toString(36)}`
}

/**
 * A ref for a block of words that changes in place (the bubble's sentence, a row of chips): its
 * view-transition name follows its text (swapName), so in a morph words that stay just move, and
 * new words rise in while the old ones lift away (.gd-swap), instead of the two crossfading on top
 * of each other. Set after every render, so the snapshot taken before a morph has the old text's name.
 */
export function useSwapName<T extends HTMLElement>(prefix: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty("view-transition-name", swapName(prefix, el.textContent ?? ""))
    el.style.setProperty("view-transition-class", "gd-swap")
  })
  return ref
}
