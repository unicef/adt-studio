import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PreviewShell({
  label,
  className,
  bodyClassName,
  children,
}: {
  label: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md bg-card shadow-[0px_17px_38px_0px_rgba(0,0,0,0.1),0px_69px_69px_0px_rgba(0,0,0,0.09),0px_155px_93px_0px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      <div className="shrink-0 overflow-hidden border-b border-border/80 bg-muted/25 px-3 py-2">
        <p
          key={label}
          className="animate-preview-label-enter text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </p>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto bg-muted/40 flex flex-col", bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
