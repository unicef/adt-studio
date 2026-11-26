import { useSyncExternalStore } from "react"

/**
 * How Check shows a decision (a lab setting while we compare them):
 * - card: the pick highlighted in a card with a picture, the others behind "See the other options"
 * - list: the question, then every answer as a plain row; the pick is checked
 * - evidence: the book's own pages that led to the answer, beside the answer and a switch for the others
 * - sentence: one plain statement with the answer as an inline choice, then the reason and the pages
 */
export const CHECK_LAYOUTS = ["card", "list", "evidence", "sentence"] as const
export type CheckLayout = (typeof CHECK_LAYOUTS)[number]

const KEY = "add-book:check-layout"
const listeners = new Set<() => void>()
let cache: CheckLayout | null = null
function read(): CheckLayout {
  if (cache) return cache
  try {
    const v = localStorage.getItem(KEY) as CheckLayout | null
    cache = v && CHECK_LAYOUTS.includes(v) ? v : "card"
  } catch {
    cache = "card"
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
    () => "card",
  )
}
