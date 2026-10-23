import { useEffect, useRef, useState } from "react"

export function useNearViewport<T extends HTMLElement>(margin = 600) {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const root = node.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root,
      rootMargin: `${margin}px 0px`,
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [margin])

  return [ref, near] as const
}
