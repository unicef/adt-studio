import { useCallback, useEffect, useRef } from "react"

const ECHO_MS = 120

export function useScrollSync(enabled: boolean) {
  const windows = useRef(new Map<string, Window>())
  const leader = useRef<{ key: string; until: number } | null>(null)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const follow = useCallback((key: string, source: Window) => {
    if (!enabledRef.current) return
    const now = performance.now()
    if (leader.current && leader.current.key !== key && now < leader.current.until) return
    leader.current = { key, until: now + ECHO_MS }
    const root = source.document.documentElement
    const range = root.scrollHeight - source.innerHeight
    const ratio = range > 0 ? source.scrollY / range : 0
    for (const [other, target] of windows.current) {
      if (other === key) continue
      const targetRange = target.document.documentElement.scrollHeight - target.innerHeight
      target.scrollTo({ top: ratio * Math.max(0, targetRange) })
    }
  }, [])

  return useCallback(
    (key: string, target: Window | null) => {
      if (!target) {
        windows.current.delete(key)
        return
      }
      windows.current.set(key, target)
      target.addEventListener("scroll", () => follow(key, target), { passive: true })
    },
    [follow],
  )
}
