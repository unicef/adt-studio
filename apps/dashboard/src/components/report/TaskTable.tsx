import { useMemo, useState } from "react"
import { Card, Swatch } from "../Card"
import { fmtDec1, fmtInt } from "../../lib/format"
import type { RunView } from "../../lib/run-view"
import type { TaskMetrics } from "../../lib/types"

interface Row extends TaskMetrics {
  run: RunView
  model: string
  effort: string
  worst: boolean
}

type Column = { key: keyof Row; label: string; numeric: boolean; decimals?: boolean }

const COLUMNS: Column[] = [
  { key: "task", label: "Task", numeric: false },
  { key: "model", label: "Model", numeric: false },
  { key: "effort", label: "Effort", numeric: false },
  { key: "calls", label: "Calls", numeric: true },
  { key: "failedCalls", label: "Failed", numeric: true },
  { key: "validationErrors", label: "Errors", numeric: true },
  { key: "inputTokens", label: "Input tokens", numeric: true },
  { key: "outputTokens", label: "Output tokens", numeric: true },
  { key: "avgS", label: "Mean (s)", numeric: true, decimals: true },
  { key: "p50S", label: "p50 (s)", numeric: true, decimals: true },
  { key: "p90S", label: "p90 (s)", numeric: true, decimals: true },
  { key: "maxS", label: "Max (s)", numeric: true, decimals: true },
  { key: "sumS", label: "Sum (s)", numeric: true, decimals: true },
]

export function TaskTable({ runs }: { runs: RunView[] }) {
  const [sort, setSort] = useState<{ key: keyof Row; dir: 1 | -1 }>({ key: "task", dir: 1 })

  const rows = useMemo<Row[]>(() => {
    const all = runs.flatMap((run) =>
      run.metrics.byTask.map((t) => ({ ...t, run, model: t.models.join(", "), effort: t.efforts.join(", ") || "—", worst: false })),
    )
    for (const row of all) {
      const peers = all.filter((r) => r.task === row.task)
      row.worst = peers.length > 1 && row.failedCalls > 0 && row.failedCalls === Math.max(...peers.map((p) => p.failedCalls)) && peers.some((p) => p.failedCalls < row.failedCalls)
    }
    const order = runs.map((r) => r.metrics.name)
    return all.sort((a, b) => {
      const va = a[sort.key]
      const vb = b[sort.key]
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
      return c * sort.dir || a.task.localeCompare(b.task) || order.indexOf(a.run.metrics.name) - order.indexOf(b.run.metrics.name)
    })
  }, [runs, sort])

  const toggle = (column: Column) =>
    setSort((current) => (current.key === column.key ? { key: column.key, dir: current.dir === 1 ? -1 : 1 } : { key: column.key, dir: column.numeric ? -1 : 1 }))

  return (
    <Card id="task-table" title="Metrics by task" note="Click a header to sort. Times are seconds per call. Red marks the conversion with the most failures on that task.">
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky top-0 bg-surface px-2 py-1.5 text-left font-medium">Conversion</th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  aria-sort={sort.key === column.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`sticky top-0 whitespace-nowrap bg-surface px-2 py-1.5 font-medium ${column.numeric ? "text-right" : "text-left"}`}
                >
                  <button type="button" onClick={() => toggle(column)} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ink">
                    {column.label}
                    {sort.key === column.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.run.metrics.name}|${row.task}`} className="border-t border-line">
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color={row.run.color} />
                    {row.run.metrics.name}
                  </span>
                </td>
                {COLUMNS.map((column) => {
                  const value = row[column.key]
                  const text = typeof value === "number" ? (column.decimals ? fmtDec1(value) : fmtInt(value)) : String(value)
                  const hot = column.key === "failedCalls" && row.worst
                  return (
                    <td key={column.key} className={`whitespace-nowrap px-2 py-1.5 ${column.numeric ? "text-right" : "text-left"} ${hot ? "font-medium text-bad" : ""}`}>
                      {text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
