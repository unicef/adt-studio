import { CheckCircle2, CalendarOff, KeyRound, Link2Off } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { PublicationState } from "@adt/types"
import { cn } from "@/lib/utils"

const CHIP_BASE =
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"

const TONE: Record<PublicationState, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  expired: "border-amber-200 bg-amber-50 text-amber-900",
  revoked: "border-border bg-muted text-muted-foreground",
}

/** The lifecycle of one share link. The wording is the same as the Publish panel's header pill,
 *  so a book does not change vocabulary between the two screens. */
export function PublicationStatusChip({
  state,
  className,
}: {
  state: PublicationState
  className?: string
}) {
  return (
    <span className={cn(CHIP_BASE, TONE[state], className)}>
      {state === "active" ? (
        <CheckCircle2 className="size-3" aria-hidden="true" />
      ) : state === "expired" ? (
        <CalendarOff className="size-3" aria-hidden="true" />
      ) : (
        <Link2Off className="size-3" aria-hidden="true" />
      )}
      {state === "active" ? (
        <Trans>Live</Trans>
      ) : state === "expired" ? (
        <Trans>Link expired</Trans>
      ) : (
        <Trans>Sharing stopped</Trans>
      )}
    </span>
  )
}

/** Shown beside the lifecycle chip, never instead of it: the code guards the door of a link
 *  that may itself be live, expired or stopped. */
export function AccessCodeChip() {
  return (
    <span className={cn(CHIP_BASE, "border-indigo-200 bg-indigo-50 text-indigo-800")}>
      <KeyRound className="size-3" aria-hidden="true" />
      <Trans>Code required</Trans>
    </span>
  )
}
