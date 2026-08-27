import { useEffect, useRef, useState } from "react"
import { Check, CheckCircle2, CalendarOff, Copy, KeyRound, Link2Off } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
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

const CODE_TONE = "border-indigo-200 bg-indigo-50 text-indigo-800"

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
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  if (!code) {
    return (
      <span className={cn(CHIP_BASE, CODE_TONE)}>
        <KeyRound className="size-3" aria-hidden="true" />
        <Trans>Code required</Trans>
      </span>
    )
  }

  async function copyCode() {
    if (!code) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    timerRef.current = setTimeout(() => setCopied(false), 2500)
  }

  return (
    <button
      type="button"
      onClick={() => void copyCode()}
      title={t`Copy the access code`}
      aria-label={t`Access code ${code}. Copy it.`}
      className={cn(
        CHIP_BASE,
        CODE_TONE,
        "cursor-pointer transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
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
