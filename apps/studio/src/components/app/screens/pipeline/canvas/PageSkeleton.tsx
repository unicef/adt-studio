import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function SectionSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-lg border bg-card p-6 motion-safe:animate-pulse",
        className,
      )}
    >
      <span className="sr-only">
        <Trans>Loading page preview…</Trans>
      </span>
      <div className="h-4 w-2/5 rounded bg-muted-foreground/15" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
        <div className="h-2.5 w-11/12 rounded bg-muted-foreground/10" />
        <div className="h-2.5 w-4/5 rounded bg-muted-foreground/10" />
      </div>
      <div className="min-h-24 flex-1 rounded-md bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
        <div className="h-2.5 w-10/12 rounded bg-muted-foreground/10" />
        <div className="h-2.5 w-1/2 rounded bg-muted-foreground/10" />
      </div>
    </div>
  )
}

export function ThumbSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy
      className={cn("bg-muted motion-safe:animate-pulse", className)}
    >
      <span className="sr-only">
        <Trans>Loading page preview…</Trans>
      </span>
    </div>
  )
}
