import { useCallback, useEffect, useRef, useState } from "react"

const FLASH_MS = 1200

const mode = "(prefers-reduced-motion: reduce)"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(mode).matches === true
}

export function useRowFlash() {
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reveal = useCallback((key: string) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`)
          ?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
      }),
    )
    if (reducedMotion()) return
    window.clearTimeout(timer.current)
    setFlashKey(key)
    timer.current = window.setTimeout(() => setFlashKey(null), FLASH_MS)
  }, [])

  return { flashKey, reveal }
}
