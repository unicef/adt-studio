import { useEffect, useState } from "react"

/** Viewport width (px) below which the reader switches to its mobile layout.
 *  Matches Tailwind's `sm` breakpoint so `sm:` utility variants and this hook
 *  stay in lockstep (base styles = mobile, `sm:` = desktop). */
export const MOBILE_BREAKPOINT = 640

/** True when the viewport is narrower than `breakpoint`. Reacts to resize /
 *  orientation changes. SSR-safe (returns false when `window` is absent). */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint - 0.02}px)`

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return isMobile
}
