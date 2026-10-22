import { useMemo, useState } from "react"
import { Card, RunLegend } from "../Card"
import { GroupBars, type GroupRow } from "./GroupBars"
import { fmtInt, fmtTokens } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

type Kind = "inputTokens" | "outputTokens"

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "inputTokens", label: "Input" },
  { kind: "outputTokens", label: "Output" },
]

export function TokensCard({ runs }: { runs: RunView[] }) {
  const [kind, setKind] = useState<Kind>("inputTokens")
  const rows = useMemo<GroupRow[]>(() => {
    const tasks = [...new Set(runs.flatMap((r) => r.metrics.byTask.map((t) => t.task)))]
    return tasks
      .map((task) => {
        const stats = runs.map((r) => r.metrics.byTask.find((t) => t.task === task))
        return {
          label: task,
          values: stats.map((t) => t?.[kind] ?? 0),
          tip: runs.map((r, i) => ({
            color: r.color,
            label: `${r.metrics.name} (${stats[i]?.models.join(", ") ?? "—"})`,
            value: fmtInt(stats[i]?.[kind] ?? 0),
          })),
        }
      })
      .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0))
  }, [runs, kind])

  return (
    <Card id="tokens-by-task" title="Tokens by task" note="Sum over every call of the task, retries included.">
      <div className="inline-flex self-start overflow-hidden rounded-md border border-line" role="group" aria-label="Token type">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className="px-3 py-1 text-xs text-muted aria-pressed:bg-page aria-pressed:font-medium aria-pressed:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
          >
            {k.label}
          </button>
        ))}
      </div>
      <RunLegend runs={runs} />
      <GroupBars runs={runs} rows={rows} format={fmtTokens} label="Tokens by task" />
    </Card>
  )
}
