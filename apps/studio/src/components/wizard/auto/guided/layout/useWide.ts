import { useSyncExternalStore } from "react"

/** Tailwind's `lg`, where the page column widens and the page fits the window instead of scrolling. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query
export const WIDE = "(min-width: 1024px)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** The window is at least Tailwind's `lg` wide. */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}
