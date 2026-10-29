import { useCallback, useMemo, useState } from "react"
import { Card, RunLegend } from "../Card"
import { ChartBox, type Tip } from "../ChartBox"
import { fmtInt } from "../../lib/format"
import type { RunView } from "../../lib/run-view"
import { linear } from "../../lib/scale"

const HEIGHT = 220
const TOP = 20
const BOTTOM = 26

const attemptLabel = (attempt: number) => (attempt === 0 ? "1st" : `+${attempt}`)

export function AttemptsCard({ runs }: { runs: RunView[] }) {
  const tasks = useMemo(() => {
    const retries = new Map<string, number>()
    for (const run of runs) {
      for (const a of run.metrics.attempts) if (a.attempt > 0) retries.set(a.task, (retries.get(a.task) ?? 0) + a.calls)
    }
    return [...retries].sort((a, b) => b[1] - a[1]).map(([task]) => task)
  }, [runs])
  const [picked, setPicked] = useState<string | null>(null)
  const task = picked && tasks.includes(picked) ? picked : tasks[0]

  const draw = useCallback(
    (width: number, tip: Tip) => {
      if (!task) return null
      const rows = runs.map((r) => r.metrics.attempts.filter((a) => a.task === task))
      const maxAttempt = Math.max(0, ...rows.flat().map((a) => a.attempt))
      const steps = Array.from({ length: maxAttempt + 1 }, (_, i) => i)
      const maxCalls = Math.max(1, ...rows.flat().map((a) => a.calls))
      const groupW = (width - 8) / steps.length
      const barW = Math.min(32, (groupW * 0.7) / runs.length)
      const y = linear([0, maxCalls], [HEIGHT - BOTTOM, TOP])
      return (
        <svg className="chart block" width={width} height={HEIGHT} role="img" aria-label={`Attempts for ${task}`}>
          <line className="axis" x1={0} x2={width} y1={y(0)} y2={y(0)} />
          {steps.map((attempt) => {
            const groupX = 4 + attempt * groupW
            const innerW = barW * runs.length + 4 * (runs.length - 1)
            return (
              <g key={attempt}>
                <text x={groupX + groupW / 2} y={HEIGHT - 8} textAnchor="middle">{attemptLabel(attempt)}</text>
                {runs.map((run, j) => {
                  const bucket = rows[j].find((a) => a.attempt === attempt)
                  if (!bucket) return null
                  const bx = groupX + (groupW - innerW) / 2 + j * (barW + 4)
                  return (
                    <g
                      key={run.metrics.name}
                      onMouseMove={(event) => tip.show(event, `${task} · ${attempt === 0 ? "first call" : `retry ${attempt}`}`, [{ color: run.color, label: run.metrics.name, value: `${fmtInt(bucket.calls)} calls` }])}
                      onMouseLeave={tip.hide}
                    >
                      <rect x={bx} y={y(bucket.calls)} width={barW} height={Math.max(1, y(0) - y(bucket.calls))} rx={4} style={{ fill: run.color }} />
                      <text x={bx + barW / 2} y={y(bucket.calls) - 5} textAnchor="middle">{fmtInt(bucket.calls)}</text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      )
    },
    [runs, task],
  )

  return (
    <Card id="attempts" title="Attempts per item" note="Calls per attempt: 1st is the item's first call; +1, +2… are retries, each caused by a rejected response.">
      {task ? (
        <>
          <select
            aria-label="Task"
            value={task}
            onChange={(event) => setPicked(event.target.value)}
            className="self-start rounded-md border border-line bg-page px-2 py-1 text-xs text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            {tasks.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <RunLegend runs={runs} />
          <ChartBox minHeight={HEIGHT}>{draw}</ChartBox>
        </>
      ) : (
        <p className="text-sm text-muted">No task needed a retry.</p>
      )}
    </Card>
  )
}
