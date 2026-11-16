import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { formatPercent } from "./publish-format"

export type PublishTone = "running" | "failed" | "done"

/** `aria-valuetext` is polled by the screen reader, not pushed — but a string that changes 340
 *  times a minute still churns the accessibility tree for nothing. Once a second is plenty. */
const VALUE_TEXT_REFRESH_MS = 1_000

function useThrottledText(text: string): string {
  const [shown, setShown] = useState(text)
  const latest = useRef(text)
  latest.current = text

  useEffect(() => {
    const timer = setInterval(() => {
      setShown((current) => (current === latest.current ? current : latest.current))
    }, VALUE_TEXT_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  return shown
}

/**
 * One bar for the run. Not one per step, and never a second one anywhere on the screen.
 *
 * It is fed the shared aggregate, which is monotonic by construction, so the width transition only
 * ever runs forwards — a bar that could go backwards would have to be animated in both directions,
 * and a progress bar visibly losing ground is the single most alarming thing this screen could do.
 *
 * The percentage stays, small, at the right. It is the cheap answer to "how much is left" and a
 * terrible answer to "is it still moving", which is why the count above it is four times its size.
 */
export function PublishAggregateBar({
  percent,
  valueText,
  tone,
}: {
  percent: number
  valueText: string
  tone: PublishTone
}) {
  const { i18n } = useLingui()
  const shownValueText = useThrottledText(valueText)

  return (
    <div className="flex w-full items-center gap-3">
      <div
        data-testid="publish-aggregate-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={shownValueText}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            tone === "failed"
              ? "bg-destructive"
              : tone === "done"
                ? "bg-emerald-500"
                : "bg-indigo-600",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="min-w-[4ch] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {formatPercent(percent, i18n.locale)}
      </span>
    </div>
  )
}
