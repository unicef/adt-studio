import { Check, CheckCircle2, CalendarOff, Copy, KeyRound, Link2Off } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PublicationState } from "@adt/types"
import { useCopyLink } from "@/hooks/use-copy-link"
import { cn } from "@/lib/utils"

const CHIP_BASE =
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"

/** Alpha tints rather than the `-50` shades, so the same chip reads on a light and a dark card. */
const TONE: Record<PublicationState, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
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

const CODE_TONE = "border-brand-200 bg-brand-50 text-brand-700"

/**
 * Shown beside the lifecycle chip, never instead of it: the code guards the door of a link that
 * may itself be live, expired or stopped.
 *
 * The code is shown in the clear, because this screen is the author's own machine and the point
 * of it is to be read out to a class. When the plaintext is missing — a book published from
 * another computer — the chip degrades to naming the requirement, since the worker stores only
 * a hash and nobody can recover the code from here.
 */
export function AccessCodeChip({ code }: { code?: string | null }) {
  const { t } = useLingui()
  /** `?? ""` because the hook is above the early return below and a chip with no code has
   *  nothing to copy — the button that would call it is never rendered. */
  const { copied, copy } = useCopyLink(code ?? "")

  if (!code) {
    return (
      <span className={cn(CHIP_BASE, CODE_TONE)}>
        <KeyRound className="size-3" aria-hidden="true" />
        <Trans>Code required</Trans>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={t`Copy the access code`}
      aria-label={t`Access code ${code}. Copy it.`}
      className={cn(
        CHIP_BASE,
        CODE_TONE,
        "cursor-pointer transition-colors duration-200 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
      )}
    >
      <KeyRound className="size-3" aria-hidden="true" />
      <span className="font-mono tracking-wider">{code}</span>
      {copied ? (
        <Check
          className="size-3 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
          aria-hidden="true"
        />
      ) : (
        <Copy className="size-3 opacity-60" aria-hidden="true" />
      )}
    </button>
  )
}
