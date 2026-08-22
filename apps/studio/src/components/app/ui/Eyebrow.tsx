import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground",
        className,
      )}
    >
      <span className="h-px w-6 shrink-0 bg-current opacity-50" />
      {children}
    </div>
  )
}
