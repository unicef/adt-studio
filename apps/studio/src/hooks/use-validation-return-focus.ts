import { useEffect, useRef } from "react"

/** Restore the finding once, after its read model is ready. Refetches do not steal focus. */
export function useValidationReturnFocus(elementId: string | undefined, ready: boolean) {
  const consumed = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!ready || !elementId || consumed.current === elementId) return
    const element = document.getElementById(elementId)
    if (!element) return
    consumed.current = elementId
    element.scrollIntoView?.({ block: "center" })
  }, [elementId, ready])
}
