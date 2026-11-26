import { useSyncExternalStore } from "react"

/**
 * How the Check page is arranged around its decision (a lab setting while we compare them):
 * - current: the list of screens on the left, the decision in an outlined card
 * - split: no list; the picture large on the left, the answer, its options and the buttons on the right
 * - focus: one narrow column, top to bottom (the picture across it), with a bar for Back / Next
 * - summary: the decision on the left, without a card; on the right "Your book" fills in as you go
 */
export const CHECK_LAYOUTS = ["current", "split", "focus", "summary"] as const
export type CheckLayout = (typeof CHECK_LAYOUTS)[number]

const KEY = "add-book:check-layout"
const listeners = new Set<() => void>()
let cache: CheckLayout | null = null
function read(): CheckLayout {
  if (cache) return cache
  try {
    const v = localStorage.getItem(KEY) as CheckLayout | null
    cache = v && CHECK_LAYOUTS.includes(v) ? v : "current"
  } catch {
    cache = "current"
  }
  return cache
}
export function setCheckLayout(layout: CheckLayout) {
  cache = layout
  try {
    localStorage.setItem(KEY, layout)
  } catch {
    /* storage blocked: lasts until reload */
  }
  for (const l of listeners) l()
}
export function useCheckLayout(): CheckLayout {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => "current",
  )
}
