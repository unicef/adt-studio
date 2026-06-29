import { Plural, Trans, useLingui } from "@lingui/react/macro"
import type { SplitStatus } from "../../api/client"
import { cn } from "../../lib/utils"
import { computeCoverageSegments, fmtRange, type CoverageState } from "./parts-utils"

const SEGMENT_FILL: Record<CoverageState, string> = {
  merged: "bg-emerald-500",
  exported: "bg-part",
  pending: "bg-muted-foreground/20",
}

const DOT_FILL: Record<CoverageState, string> = {
  merged: "bg-emerald-500",
  exported: "bg-part",
  pending: "bg-muted-foreground/30",
}

/**
 * A proportional, single-row map of the whole book by part lifecycle: merged
 * back in (done), exported but still out for processing, and not split yet.
 * Turns the scattered range badges into one glanceable picture of progress.
 */
export function CoverageBar({ status }: { status: SplitStatus }) {
  const { t } = useLingui()
  const segments = computeCoverageSegments(status)
  if (segments.length === 0) return null

  const merged = status.mergedRanges.reduce((n, r) => n + (r.endPage - r.startPage + 1), 0)
  const total = status.pageCount
  const labelFor: Record<CoverageState, string> = {
    merged: t`Merged`,
    exported: t`Out for processing`,
    pending: t`Not split yet`,
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Trans>Book coverage</Trans>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          <Plural
            value={merged}
            _0={`0 of ${total} pages merged`}
            one={`# of ${total} pages merged`}
            other={`# of ${total} pages merged`}
          />
        </span>
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <div
            key={`${seg.state}-${seg.startPage}`}
            className={cn(
              "h-full transition-[flex-grow] duration-500 ease-out",
              SEGMENT_FILL[seg.state],
            )}
            style={{ flexGrow: seg.pages }}
            title={`${labelFor[seg.state]}: ${fmtRange(seg)}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(["merged", "exported", "pending"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", DOT_FILL[state])} />
            {labelFor[state]}
          </span>
        ))}
      </div>
    </div>
  )
}
