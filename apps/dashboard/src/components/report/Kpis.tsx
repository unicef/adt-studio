import { Swatch } from "../Card"
import { fmtDuration, fmtInt, fmtPct, fmtTokens, fmtUsd } from "../../lib/format"
import { APP_PRICE, relativeChange } from "../../lib/metrics"
import type { RunView } from "../../lib/run-view"
import type { RunMetrics } from "../../lib/types"

interface Kpi {
  id: string
  label: string
  note: string
  value: (m: RunMetrics) => number
  format: (n: number) => string
}

const KPIS: Kpi[] = [
  { id: "time", label: "Total time", note: "From the conversion start to the end of the last step", value: (m) => m.totalS, format: fmtDuration },
  { id: "calls", label: "LLM calls", note: "Retries included", value: (m) => m.callCount, format: fmtInt },
  { id: "failed", label: "Failed calls", note: "Rejected by validation or timed out, then retried", value: (m) => m.failedCalls, format: fmtInt },
  { id: "errors", label: "Validation errors", note: "Messages in validationErrors; one failure can have several", value: (m) => m.validationErrors, format: fmtInt },
  { id: "tokens", label: "Tokens", note: "Input + output", value: (m) => m.inputTokens + m.outputTokens, format: fmtTokens },
  {
    id: "cost",
    label: "Estimated cost",
    note: `Studio Stats tab formula: ${fmtUsd(APP_PRICE.inputPerMillion)}/M input, ${fmtUsd(APP_PRICE.outputPerMillion)}/M output, the same for every model`,
    value: (m) => m.costUsd,
    format: fmtUsd,
  },
]

export function Kpis({ runs }: { runs: RunView[] }) {
  const [base] = runs
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {KPIS.map((kpi) => (
        <div key={kpi.id} id={`kpi-${kpi.id}`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface px-5 py-4">
          <div>
            <div className="text-sm font-medium text-ink">{kpi.label}</div>
            <div className="text-xs text-muted">{kpi.note}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {runs.map((run, i) => {
              const value = kpi.value(run.metrics)
              const change = i === 0 ? null : relativeChange(kpi.value(base.metrics), value)
              return (
                <div key={run.metrics.name} className="flex flex-wrap items-baseline gap-x-2">
                  <Swatch color={run.color} />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted" title={run.metrics.name}>{run.metrics.name}</span>
                  <span className="text-xl tabular-nums text-ink">{kpi.format(value)}</span>
                  {change !== null && (
                    <span className={`w-full text-right text-xs font-medium ${change <= 0 ? "text-good" : "text-bad"}`}>
                      {change < 0 ? "▼" : change > 0 ? "▲" : "="} {fmtPct(change)} vs baseline
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
