import { useId, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { CopyTextButton } from "@/components/import/ImportReview/CopyTextButton"
import { cn } from "@/lib/utils"

/** The raw server message, shown inline under a disclosure the way the app's
 * error screen does it, with a Copy button for bug reports. */
export function ErrorDetails({ message, className }: { message: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-300 ease-out", open && "rotate-180")} />
        {open ? <Trans>Hide error details</Trans> : <Trans>Show error details</Trans>}
      </button>
      <div
        id={panelId}
        className={cn(
          "grid w-full transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out motion-reduce:transition-none",
          open ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left">
            <p className="min-w-0 break-words font-mono text-xs leading-relaxed text-destructive">{message}</p>
            {open ? <CopyTextButton value={message}><Trans>Copy</Trans></CopyTextButton> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
