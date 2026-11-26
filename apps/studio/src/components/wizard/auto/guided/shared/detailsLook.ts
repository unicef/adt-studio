import { createContext, useContext, useSyncExternalStore } from "react"

/**
 * How a sure pick shows its other options (a lab-only variant for now):
 * - "accordion": "See the other options" opens the picture cards under the pick.
 * - "switch": a segmented switch under the pick; each option swaps the big picture at once.
 * - "strip": small picture thumbnails, always in view, under the pick.
 * - "sheet": "See the other options" opens the picture cards in a sheet from the bottom.
 */
export type DetailsLook = "accordion" | "switch" | "strip" | "sheet"

const listeners = new Set<() => void>()
let look: DetailsLook = "accordion"

export function setDetailsLook(next: DetailsLook) {
  look = next
  for (const l of listeners) l()
}

export function useDetailsLook(): DetailsLook {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => look,
    () => look,
  )
}

/** Inside a sheet: closes it once an option is picked, so the pick shows on the page. */
export const PickedContext = createContext<(() => void) | null>(null)
export const usePicked = () => useContext(PickedContext)
