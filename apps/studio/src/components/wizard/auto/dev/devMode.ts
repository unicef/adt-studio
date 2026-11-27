import { useState } from "react"

const KEY = "add-book:dev-mode"

/**
 * Dev mode for the Add Book flow (development builds only): on by default while only developers
 * use the flow; `?dev=0` hides it in this browser and `?dev` (or `?dev=1`) shows it again. It adds
 * the decision report.
 */
export function useDevMode(): boolean {
  const [on] = useState(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return false
    const param = new URLSearchParams(window.location.search).get("dev")
    try {
      if (param !== null) localStorage.setItem(KEY, param === "0" ? "0" : "1")
      return localStorage.getItem(KEY) !== "0"
    } catch {
      return param !== "0"
    }
  })
  return on
}
