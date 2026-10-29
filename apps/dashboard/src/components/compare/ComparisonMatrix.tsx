import { useMemo, useState } from "react"
import { GroupRow, LOWER_IS_BETTER, MatrixTable, MetricPicker } from "./MatrixTable"
import { MetricRow } from "./MetricRow"
import type { Workspace } from "../../hooks/useWorkspace"
import { fmtDec1, fmtInt, fmtTokens } from "../../lib/format"
import { KPIS } from "../../lib/kpis"
import { taskOrder } from "../../lib/metrics"
import type { RunView } from "../../lib/run-view"
import type { TaskMetrics } from "../../lib/types"

type TaskKey = "calls" | "failedCalls" | "validationErrors" | "inputTokens" | "outputTokens" | "avgS" | "p50S" | "p90S" | "maxS" | "sumS"

const TASK_METRICS: { key: TaskKey; label: string; format: (n: number) => string }[] = [
  { key: "calls", label: "Calls", format: fmtInt },
  { key: "failedCalls", label: "Failed", format: fmtInt },
  { key: "validationErrors", label: "Errors", format: fmtInt },
  { key: "inputTokens", label: "Input tokens", format: fmtTokens },
  { key: "outputTokens", label: "Output tokens", format: fmtTokens },
  { key: "avgS", label: "Mean s", format: fmtDec1 },
  { key: "p50S", label: "p50 s", format: fmtDec1 },
  { key: "p90S", label: "p90 s", format: fmtDec1 },
  { key: "maxS", label: "Max s", format: fmtDec1 },
  { key: "sumS", label: "Sum s", format: fmtDec1 },
]

const taskDetail = (stats: (TaskMetrics | undefined)[]) => {
  const models = [...new Set(stats.flatMap((t) => t?.models ?? []))]
  const efforts = [...new Set(stats.flatMap((t) => t?.efforts ?? []))]
  return [models.join(", "), efforts.length ? `effort ${efforts.join(", ")}` : ""].filter(Boolean).join(" · ")
}

export function SummaryMatrix({ workspace, runs }: { workspace: Workspace; runs: RunView[] }) {
  const colors = runs.map((r) => r.color)
  return (
    <MatrixTable workspace={workspace} runs={runs} legend={LOWER_IS_BETTER}>
      <GroupRow span={1 + runs.length} title="Summary" />
      {KPIS.map((kpi) => (
        <MetricRow key={kpi.id} label={kpi.label} note={kpi.note} values={runs.map((r) => kpi.value(r.metrics))} colors={colors} format={kpi.format} />
      ))}
    </MatrixTable>
  )
}

export function TaskMatrix({ workspace, runs }: { workspace: Workspace; runs: RunView[] }) {
  const [metricKey, setMetricKey] = useState<TaskKey>("p50S")
  const metric = TASK_METRICS.find((m) => m.key === metricKey) ?? TASK_METRICS[0]
  const colors = runs.map((r) => r.color)
  const tasks = useMemo(() => taskOrder(runs.map((r) => r.metrics)), [runs])

  return (
    <MatrixTable workspace={workspace} runs={runs} legend={LOWER_IS_BETTER}>
      <GroupRow span={1 + runs.length} title="By task">
        <MetricPicker label="Task metric" options={TASK_METRICS} value={metricKey} onChange={setMetricKey} />
      </GroupRow>
      {tasks.map((task) => {
        const stats = runs.map((r) => r.metrics.byTask.find((t) => t.task === task))
        return <MetricRow key={task} label={task} note={taskDetail(stats)} values={stats.map((t) => (t ? t[metric.key] : null))} colors={colors} format={metric.format} />
      })}
    </MatrixTable>
  )
}
