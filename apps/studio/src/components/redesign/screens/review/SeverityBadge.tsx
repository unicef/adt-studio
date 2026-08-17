import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Severity } from "./types"

/* `Badge variant="destructive"` is unusable in dark: the .dark block flips --destructive to a dark
 * maroon and --destructive-foreground to a bright red, so the shipped pair renders red-on-maroon at
 * ~2.6:1 (finding d-2). Tint + foreground-as-ink works in both themes. */
const TONE: Record<Severity, string> = {
  blocker: "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground",
  major: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  minor: "border-transparent bg-secondary text-secondary-foreground",
  nit: "text-muted-foreground",
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 px-2 py-0 text-[10px] uppercase tracking-[0.08em]", TONE[severity], className)}
    >
      {severity}
    </Badge>
  )
}

export function SeverityCount({ severity, count }: { severity: Severity; count: number }) {
  return (
    <span
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums",
        count === 0 && "bg-muted text-muted-foreground/60",
        count > 0 && severity === "blocker" && "bg-destructive/15 text-destructive dark:text-destructive-foreground",
        count > 0 && severity === "major" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        count > 0 && severity === "minor" && "bg-brand-50 text-brand-700",
        count > 0 && severity === "nit" && "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  )
}
