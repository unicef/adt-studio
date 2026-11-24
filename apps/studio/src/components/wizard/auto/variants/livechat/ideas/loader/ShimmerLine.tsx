import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"

/**
 * c13: the status words themselves, with a light band sliding across them, and the real seconds
 * since it started rolling in beside them. No estimate of what's left: the engine reports none.
 */
export function ShimmerLine({ seconds, children }: { seconds: number; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="lcl-shim font-medium">{children}</span>
      <span className="inline-flex items-baseline gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[14px] font-semibold tabular-nums text-muted-foreground">
        <span key={seconds} className="lcl-roll text-foreground">
          {seconds}
        </span>
        <Trans comment="Seconds since the assistant started reading the book">s</Trans>
      </span>
    </p>
  )
}
