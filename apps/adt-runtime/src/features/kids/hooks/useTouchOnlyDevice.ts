import { useEffect, useState } from "react"

/**
 * True when the device has no hover and only a coarse pointer — a phone or a
 * tablet without a keyboard attached.
 *
 * Used to drop the onboarding's keyboard-shortcut teaching, which is not just
 * noise on a touch device but actively confusing: a child is told to press
 * arrow keys that do not exist.
 *
 * Defaults to false (assume a keyboard) so any environment without
 * `matchMedia` keeps the full tour rather than silently hiding steps.
 */
export function useTouchOnlyDevice(): boolean {
  const [touchOnly, setTouchOnly] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return

    const query = window.matchMedia("(any-hover: none) and (any-pointer: coarse)")
    setTouchOnly(query.matches)

    const onChange = (event: MediaQueryListEvent) => setTouchOnly(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return touchOnly
}
