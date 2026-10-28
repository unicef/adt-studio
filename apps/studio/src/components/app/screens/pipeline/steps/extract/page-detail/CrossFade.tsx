import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const FADE_MS = 200

export function CrossFade({ itemKey, children, className }: { itemKey: string; children: ReactNode; className?: string }) {
  const last = useRef<{ key: string; node: ReactNode }>({ key: itemKey, node: children })
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null)
  if (last.current.key !== itemKey) {
    setLeaving(last.current)
    last.current = { key: itemKey, node: children }
  } else {
    last.current = { key: itemKey, node: children }
  }

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), FADE_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  return (
    <div className={cn("grid", className)}>
      {leaving && (
        <div key={`leaving-${leaving.key}`} aria-hidden inert className="col-start-1 row-start-1 animate-out fade-out fill-mode-forwards duration-200 motion-reduce:hidden">
          {leaving.node}
        </div>
      )}
      <div key={`current-${itemKey}`} className="col-start-1 row-start-1 min-w-0 animate-in fade-in duration-200 motion-reduce:animate-none">
        {children}
      </div>
    </div>
  )
}
