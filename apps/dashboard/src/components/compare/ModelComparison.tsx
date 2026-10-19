import { useMemo, useState } from "react"
import { GroupRow, MatrixTable, MetricPicker } from "./MatrixTable"
import { MetricRow, RowShell } from "./MetricRow"
import type { Workspace } from "../../hooks/useWorkspace"
import { fmtDec1, fmtInt, fmtPct, fmtTokens, fmtUsd } from "../../lib/format"
import { taskOrder } from "../../lib/metrics"
import { modelOrder, modelStats, type ModelStats } from "../../lib/models"
import type { RunView } from "../../lib/run-view"

type ModelKey = "calls" | "failedCalls" | "validationErrors" | "inputTokens" | "outputTokens" | "avgS" | "p50S" | "p90S" | "sumS" | "costUsd"

const MODEL_METRICS: { key: ModelKey; label: string; format: (n: number) => string }[] = [
  { key: "calls", label: "Calls", format: fmtInt },
  { key: "failedCalls", label: "Failed", format: fmtInt },
  { key: "validationErrors", label: "Errors", format: fmtInt },
  { key: "inputTokens", label: "Input tokens", format: fmtTokens },
  { key: "outputTokens", label: "Output tokens", format: fmtTokens },
  { key: "avgS", label: "Mean s", format: fmtDec1 },
  { key: "p50S", label: "p50 s", format: fmtDec1 },
  { key: "p90S", label: "p90 s", format: fmtDec1 },
  { key: "sumS", label: "Sum s", format: fmtDec1 },
  { key: "costUsd", label: "Cost", format: fmtUsd },
]

const MODELS_LEGEND = "Share shows how each conversion split its calls between models. In By model, lower is better and badges compare with the baseline."

const RANKS = ["main", "secondary"]

const share = (n: number) => fmtPct(n).replace("+", "")

export function ModelComparison({ workspace, runs }: { workspace: Workspace; runs: RunView[] }) {
  const [metricKey, setMetricKey] = useState<ModelKey>("calls")
  const metric = MODEL_METRICS.find((m) => m.key === metricKey) ?? MODEL_METRICS[0]
  const stats = useMemo(() => runs.map((r) => modelStats(r.metrics)), [runs])
  const models = useMemo(() => modelOrder(runs.map((r) => r.metrics)), [runs])
  const tasks = useMemo(() => taskOrder(runs.map((r) => r.metrics)), [runs])
  const colors = runs.map((r) => r.color)
  const span = 1 + runs.length
  const find = (i: number, model: string) => stats[i].find((s) => s.model === model)

  return (
    <MatrixTable workspace={workspace} runs={runs} legend={MODELS_LEGEND}>
      <GroupRow span={span} title="Share of the calls" />
      {models.map((model) => (
        <RowShell key={model} label={model} note={usedBy(stats.map((s) => s.find((m) => m.model === model)))}>
          {runs.map((run, i) => (
            <ShareCell key={run.metrics.name} stat={find(i, model)} rank={stats[i].findIndex((s) => s.model === model)} color={run.color} />
          ))}
        </RowShell>
      ))}

      <GroupRow span={span} title="By model">
        <MetricPicker label="Model metric" options={MODEL_METRICS} value={metricKey} onChange={setMetricKey} />
      </GroupRow>
      {models.map((model) => (
        <MetricRow key={model} label={model} values={runs.map((_, i) => find(i, model)?.[metric.key] ?? null)} colors={colors} format={metric.format} />
      ))}

      <GroupRow span={span} title="Model used by each task" />
      {tasks.map((task) => {
        const cells = runs.map((r) => {
          const t = r.metrics.byTask.find((b) => b.task === task)
          return t ? { models: t.models.join(", "), efforts: t.efforts.join(", ") } : null
        })
        const [base] = cells
        return (
          <RowShell key={task} label={task}>
            {cells.map((cell, i) => {
              const changed = i > 0 && cell !== null && base !== null && (cell.models !== base.models || cell.efforts !== base.efforts)
              return (
                <td key={runs[i].metrics.name} className="px-3 py-3 align-top group-hover:bg-ink/[0.02]">
                  {cell ? (
                    <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
                      <span className={changed ? "font-medium text-ink" : "text-ink-2"}>{cell.models}</span>
                      {cell.efforts && <span className="text-xs text-muted">effort {cell.efforts}</span>}
                      {changed && <span className="rounded-full bg-accent/12 px-1.5 text-[10px] font-medium text-accent">changed</span>}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </td>
              )
            })}
          </RowShell>
        )
      })}
    </MatrixTable>
  )
}

function usedBy(stats: (ModelStats | undefined)[]): string {
  const tasks = [...new Set(stats.flatMap((s) => s?.tasks ?? []))]
  return tasks.length ? `used by ${tasks.join(", ")}` : ""
}

function ShareCell({ stat, rank, color }: { stat: ModelStats | undefined; rank: number; color: string }) {
  if (!stat) {
    return (
      <td className="px-3 py-3 align-top group-hover:bg-ink/[0.02]">
        <span className="text-sm text-muted">not used</span>
      </td>
    )
  }
  return (
    <td className="px-3 py-3 align-top group-hover:bg-ink/[0.02]">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium tabular-nums text-ink">{share(stat.share)}</span>
          <span className="text-xs tabular-nums text-muted">
            {fmtInt(stat.calls)} calls{stat.efforts.length ? ` · effort ${stat.efforts.join(", ")}` : ""}
          </span>
          {rank < RANKS.length && (
            <span className={`rounded-full px-1.5 text-[10px] font-medium tracking-wide uppercase ${rank === 0 ? "bg-ink/[0.08] text-ink" : "border border-line text-muted"}`}>{RANKS[rank]}</span>
          )}
        </div>
        <span className="block h-1 overflow-hidden rounded-full bg-ink/[0.05]">
          <span className="block h-full rounded-full" style={{ width: `${stat.share * 100}%`, background: color, opacity: 0.85 }} />
        </span>
      </div>
    </td>
  )
}
