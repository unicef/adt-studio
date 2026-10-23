import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export function ListToolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinel} aria-hidden className="-mb-4 h-0" />
      <div
        className={cn(
          "sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-2 transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none",
          stuck ? "border-border bg-card/95 shadow-sm backdrop-blur" : "border-transparent bg-transparent shadow-none",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </>
  )
}
