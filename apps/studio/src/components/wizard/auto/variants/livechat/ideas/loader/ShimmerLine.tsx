import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"

/**
 * c13: one status line with a light band sliding across it (the gradient is clipped to the text),
 * the real seconds since it started ticking up inside it with a small roll, and a quiet line under
 * it. No page count or estimate: the engine reports neither.
 */
export function ShimmerLine({ seconds, children, under }: { seconds: number; children: ReactNode; under: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[18px] font-medium leading-snug tracking-[-0.01em]">
        <span className="lcl-shim">
          {children} ·{" "}
          <span key={seconds} className="lcl-num">
            {seconds}
          </span>{" "}
          <Trans comment="Seconds since the assistant started reading the book">s</Trans>
        </span>
      </p>
      <p className="font-mono text-[13px] text-muted-foreground">{under}</p>
    </div>
  )
}
