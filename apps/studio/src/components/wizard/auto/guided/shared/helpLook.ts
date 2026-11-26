import { useSyncExternalStore } from "react"

/**
 * How the options dialog explains an option (a lab-only variant for now): "card" lays the details
 * out as sections, "chat" has the assistant say them as a run of speech bubbles.
 */
export type HelpLook = "card" | "chat"

const listeners = new Set<() => void>()
let look: HelpLook = "card"

export function setHelpLook(next: HelpLook) {
  look = next
  for (const l of listeners) l()
}

export function useHelpLook(): HelpLook {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => look,
    () => look,
  )
}
