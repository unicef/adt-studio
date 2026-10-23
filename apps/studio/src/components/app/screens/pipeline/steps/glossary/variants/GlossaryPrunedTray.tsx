import { useState, type ReactNode } from "react"
import { ChevronRight, EyeOff } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function GlossaryPrunedTray({ count, children, forceOpen = false }: { count: number; children: ReactNode; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  const expanded = open || forceOpen
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-lg border border-dashed bg-card px-3 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <ChevronRight className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", expanded && "rotate-90")} />
        <EyeOff className="size-3.5 text-muted-foreground" />
        <Trans>Pruned · {count}</Trans>
        <span className="ml-auto text-[11.5px] font-normal text-muted-foreground">
          <Trans>Left out of the book and future runs</Trans>
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        inert={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-1.5">{children}</div>
        </div>
      </div>
    </div>
  )
}
