import { useMemo } from "react"
import { Card, RunLegend } from "../Card"
import { GroupBars, type GroupRow } from "./GroupBars"
import { fmtInt } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

export function ErrorsCard({ runs }: { runs: RunView[] }) {
  const rows = useMemo<GroupRow[]>(() => {
    const types = [...new Set(runs.flatMap((r) => r.metrics.errors.map((e) => e.type)))]
    return types
      .map((type) => ({
        label: type,
        values: runs.map((r) => r.metrics.errors.filter((e) => e.type === type).reduce((s, e) => s + e.count, 0)),
        tip: runs.flatMap((r) =>
          r.metrics.errors
            .filter((e) => e.type === type)
            .sort((a, b) => b.count - a.count)
            .map((e) => ({ color: r.color, label: e.task, value: fmtInt(e.count) })),
        ),
      }))
      .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0))
  }, [runs])

  return (
    <Card id="errors-by-type" title="Validation errors by type" note="validationErrors messages grouped by their text pattern. Hover to see which task they came from.">
      <RunLegend runs={runs} />
      {rows.length ? <GroupBars runs={runs} rows={rows} format={fmtInt} label="Validation errors by type" /> : <p className="text-sm text-muted">No validation errors recorded.</p>}
    </Card>
  )
}
