import { useState } from "react"

const KEY = "add-book:dev-mode"

/**
 * Dev mode for the Add Book flow (development builds only): `?dev` (or `?dev=1`) turns it on and it
 * stays on in this browser; `?dev=0` turns it off. It adds the decision report.
 */
export function useDevMode(): boolean {
  const [on] = useState(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return false
    const param = new URLSearchParams(window.location.search).get("dev")
    try {
      if (param !== null) localStorage.setItem(KEY, param === "0" ? "0" : "1")
      return localStorage.getItem(KEY) === "1"
    } catch {
      return param !== null && param !== "0"
    }
  })
  return on
}
