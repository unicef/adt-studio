import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

/** The Beta mark for the assistant's setup: on the mode choice and in the assistant's own top bar. */
export function BetaTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-amber-800 ring-1 ring-amber-300/70 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30", className)}>
      <Trans>Beta</Trans>
    </span>
  )
}
