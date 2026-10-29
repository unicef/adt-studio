import { fmtPct } from "../../lib/format"

export function DeltaPill({ change, suffix = "" }: { change: number | null; suffix?: string }) {
  if (change === null) return <span className="text-xs text-muted">—</span>
  const tone = change < 0 ? "bg-good/12 text-good" : change > 0 ? "bg-bad/12 text-bad" : "bg-ink/[0.06] text-muted"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-xs font-medium tabular-nums whitespace-nowrap ${tone}`}>
      <span aria-hidden="true" className="text-[9px]">{change < 0 ? "▼" : change > 0 ? "▲" : "="}</span>
      {fmtPct(change)}
      {suffix}
    </span>
  )
}
