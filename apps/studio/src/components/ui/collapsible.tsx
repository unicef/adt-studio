import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Height + opacity collapse for content that slides in and out. Uses the
 * `grid-template-rows: 0fr → 1fr` technique so it animates to the content's
 * natural height without measuring. Respects reduced motion.
 */
export function Collapsible({
  shown,
  className,
  children,
}: {
  shown: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
      aria-hidden={!shown}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
