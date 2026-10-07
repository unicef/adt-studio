import { useCallback, useEffect, useRef, useState } from "react"

export type CopyState = "idle" | "copied" | "failed"

const RESET_MS = 2500

/**
 * Copy one string, and remember for a moment that it happened.
 *
 * Every screen that shows a share link needs the same three-state dance, and the failure branch
 * is the one worth keeping: `navigator.clipboard` rejects on an insecure origin and in a window
 * that isn't focused, and a button that silently does nothing there teaches the author that
 * sharing is broken. Callers that have nowhere to put the message can ignore `failed` — it
 * renders as the untouched button, which is the truth.
 */
export function useCopyLink(text: string, resetMs: number = RESET_MS) {
  const [state, setState] = useState<CopyState>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
    } catch {
      setState("failed")
    }
    timerRef.current = setTimeout(() => setState("idle"), resetMs)
  }, [text, resetMs])

  return { state, copied: state === "copied", failed: state === "failed", copy }
}
