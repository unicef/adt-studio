import { useSyncExternalStore } from "react"

const MOBILE_QUERY = "(max-width: 639px)"

function getSnapshot(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined
  }
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/** Tracks the Tailwind `sm` breakpoint so interaction structure matches CSS. */
export function useMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
