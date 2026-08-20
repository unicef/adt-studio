import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The framed sheet a stage's preview renders into.
 *
 * Every surface is a theme token: the previews inside follow the theme too, so
 * a fixed light sheet would put dark-theme content on a white card. The shadow
 * stays fixed — it reads as depth against either background.
 */
export function LandingPreviewShell({
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
        "@container flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md bg-card text-foreground",
        "shadow-[0px_17px_38px_0px_rgba(0,0,0,0.1),0px_69px_69px_0px_rgba(0,0,0,0.09),0px_155px_93px_0px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      <div className="shrink-0 overflow-hidden border-b border-border bg-card px-3 py-2">
        <p
          key={label}
          className="animate-preview-label-enter text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </p>
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-auto bg-secondary", bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
