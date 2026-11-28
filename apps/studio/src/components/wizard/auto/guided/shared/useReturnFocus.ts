import { useLayoutEffect, useRef } from "react"

/**
 * Where focus goes when a dialog closes: back to what had it when the dialog opened (its button),
 * which Radix can't do for a dialog opened without a DialogTrigger. If that button is gone (the
 * screen changed under the dialog), the Check screen's heading takes it, never the page body.
 * Pass the result as the dialog content's `onCloseAutoFocus`.
 */
export function useReturnFocus(open: boolean): (e: Event) => void {
  const from = useRef<HTMLElement | null>(null)
  // A layout effect runs before the dialog moves focus into itself (a passive effect).
  useLayoutEffect(() => {
    if (open) from.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  }, [open])
  return (e) => {
    const to = from.current?.isConnected ? from.current : document.getElementById("gd-check-title")
    from.current = null
    if (!to) return
    e.preventDefault()
    to.focus({ preventScroll: true })
  }
}
