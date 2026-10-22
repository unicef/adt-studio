import { Swatch } from "../Card"
import { DeltaPill } from "./Delta"
import { KPIS } from "../../lib/kpis"
import { fmtPct } from "../../lib/format"
import { relativeChange } from "../../lib/metrics"
import { modelStats, type ModelStats } from "../../lib/models"
import type { RunView } from "../../lib/run-view"

const TILE = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3.5"

export function Kpis({ runs }: { runs: RunView[] }) {
  const [base] = runs
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
      <ModelsTile runs={runs} />
      {KPIS.map((kpi) => (
        <div key={kpi.id} id={`kpi-${kpi.id}`} className={TILE}>
          <div className="text-sm font-medium text-ink">{kpi.label}</div>
          <div className="flex flex-col gap-1">
            <div className="text-[1.75rem] leading-none font-medium tracking-tight tabular-nums text-ink">{kpi.format(kpi.value(base.metrics))}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Swatch color={base.color} />
              <span className="truncate" title={base.metrics.name}>{base.metrics.name}</span>
            </div>
          </div>
          {runs.length > 1 && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
              {runs.slice(1).map((run) => {
                const value = kpi.value(run.metrics)
                return (
                  <div key={run.metrics.name} className="flex items-center gap-2 text-xs">
                    <Swatch color={run.color} />
                    <span className="min-w-0 flex-1 truncate text-muted" title={run.metrics.name}>{run.metrics.name}</span>
                    <span className="tabular-nums text-ink">{kpi.format(value)}</span>
                    <DeltaPill change={relativeChange(kpi.value(base.metrics), value)} />
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs leading-snug text-muted">{kpi.note}</p>
        </div>
      ))}
    </div>
  )
}

function ModelsTile({ runs }: { runs: RunView[] }) {
  const ranked = runs.map((r) => modelStats(r.metrics))
  const [base] = runs
  const [main, secondary] = ranked[0]
  return (
    <div id="kpi-models" className={TILE}>
      <div className="text-sm font-medium text-ink">Models</div>
      <div className="flex flex-col gap-1.5">
        <div className="truncate text-xl leading-tight font-medium tracking-tight text-ink" title={main?.model}>{main?.model ?? "—"}</div>
        {main && (
          <div className="text-xs text-muted">
            main model · <span className="tabular-nums text-ink-2">{fmtPct(main.share).replace("+", "")}</span> of the calls
            {main.efforts.length > 0 && ` · effort ${main.efforts.join(", ")}`}
          </div>
        )}
        <ModelLine label="secondary" stat={secondary} />
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Swatch color={base.color} />
          <span className="truncate" title={base.metrics.name}>{base.metrics.name}</span>
        </div>
      </div>
      {runs.length > 1 && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
          {runs.slice(1).map((run, i) => (
            <div key={run.metrics.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Swatch color={run.color} />
                <span className="truncate" title={run.metrics.name}>{run.metrics.name}</span>
              </div>
              <ModelLine label="main" stat={ranked[i + 1][0]} />
              <ModelLine label="secondary" stat={ranked[i + 1][1]} />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs leading-snug text-muted">Main is the model with the most calls, secondary the next one. The Models tab compares them.</p>
    </div>
  )
}

function ModelLine({ label, stat }: { label: string; stat: ModelStats | undefined }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-16 shrink-0 text-[10px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {stat ? (
        <>
          <span className="min-w-0 flex-1 truncate text-ink" title={stat.model}>
            {stat.model}
            {stat.efforts.length > 0 && <span className="text-muted"> · {stat.efforts.join(", ")}</span>}
          </span>
          <span className="tabular-nums text-ink-2">{fmtPct(stat.share).replace("+", "")}</span>
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
    </div>
  )
}
