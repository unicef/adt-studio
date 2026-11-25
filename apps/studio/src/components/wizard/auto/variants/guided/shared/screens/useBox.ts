import { useCallback, useEffect, useState } from "react"

/**
 * The inner size of an element (padding included), kept up to date, so a preview can fill whatever
 * space it gets. A callback ref, so it also measures an element that mounts later.
 */
export function useBox<T extends HTMLElement = HTMLDivElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const ref = useCallback((node: T | null) => setEl(node), [])
  useEffect(() => {
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref, box }
}
