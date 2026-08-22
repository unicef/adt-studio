import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

export function GhostCover({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={cn("h-32 w-24 rounded-lg border bg-gradient-to-br from-muted to-muted/50 opacity-60", className)}
    />
  )
}
