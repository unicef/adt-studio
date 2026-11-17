import { useDockContext } from "@/features/dock/context/dock-context"
import { cn } from "@/shared/lib/utils"

export function DockSkeleton() {
  const { isVertical } = useDockContext()
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-between gap-2",
        isVertical ? "flex-col py-1" : "px-2",
      )}
      aria-hidden="true"
      data-testid="dock-skeleton"
    >
      <div className={cn("flex items-center gap-2.5 min-w-0", isVertical ? "flex-col" : "pl-1 pr-2 py-1")}>
        <div className="h-10 w-10 rounded-lg bg-muted/60 animate-pulse motion-reduce:animate-none" />
        {!isVertical ? (
          <div className="hidden sm:flex flex-col gap-1.5">
            <div className="h-3 w-32 rounded bg-muted/60 animate-pulse motion-reduce:animate-none" />
            <div className="h-2 w-24 rounded bg-muted/40 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : null}
      </div>
      <div className={cn("flex items-center gap-1", isVertical && "flex-col")}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-10 rounded-lg bg-muted/60 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}
