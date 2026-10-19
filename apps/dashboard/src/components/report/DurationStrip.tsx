import { useCallback, useMemo, useState, type MouseEvent } from "react"
import { Card, RunLegend, Swatch } from "../Card"
import { ChartBox, type Tip } from "../ChartBox"
import { fmtDec1, fmtDuration, fmtInt } from "../../lib/format"
import { taskOrder } from "../../lib/metrics"
import { CRITICAL, type RunView } from "../../lib/run-view"
import { linear, textWidth, ticks } from "../../lib/scale"
import type { CallSpan, TaskMetrics } from "../../lib/types"

const SUB = 20
const AXIS = 24
const MIN_DOMAIN_S = 180

interface Point {
  call: CallSpan
  run: RunView
  px: number
  py: number
}

const jitter = (id: number) => (((id * 37) % 9) - 4) * 1.1
const statText = (t: TaskMetrics | undefined) => (t ? `p50 ${fmtDec1(t.p50S)} · p90 ${fmtDec1(t.p90S)} s` : "")

export function DurationStrip({ runs }: { runs: RunView[] }) {
  const order = useMemo(() => taskOrder(runs.map((r) => r.metrics)), [runs])
  const rowH = SUB * runs.length + 14
  const height = order.length * rowH + AXIS
  const [focus, setFocus] = useState<Point | null>(null)

  const draw = useCallback(
    (width: number, tip: Tip) => {
      const labelW = textWidth(order) + 14
      const showStats = width >= 640
      const statW = showStats ? textWidth(runs.flatMap((r) => r.metrics.byTask.map(statText))) + 14 : 8
      const xMax = Math.max(MIN_DOMAIN_S, ...runs.flatMap((r) => r.metrics.callSpans.map((c) => c.durationS)))
      const x = linear([0, xMax], [labelW, width - statW])
      const tickValues = ticks(xMax, width < 520 ? 4 : 9)
      const bodyH = order.length * rowH
      const points: Point[] = []
      const rows = order.map((task, i) => {
        const top = i * rowH + 4
        return {
          task,
          top,
          lanes: runs.map((run, j) => {
            const cy = top + j * SUB + SUB / 2
            const calls = run.metrics.callSpans.filter((c) => c.task === task)
            for (const call of calls) points.push({ call, run, px: x(call.durationS), py: cy + jitter(call.id) })
            return { run, cy, calls, stat: run.metrics.byTask.find((t) => t.task === task) }
          }),
        }
      })

      const onMove = (event: MouseEvent<SVGRectElement>) => {
        const box = event.currentTarget.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        let best: Point | null = null
        let bestDistance = 14
        for (const p of points) {
          const d = Math.hypot(p.px - px, p.py - py)
          if (d < bestDistance) {
            best = p
            bestDistance = d
          }
        }
        setFocus(best)
        if (!best) {
          tip.hide()
          return
        }
        const c = best.call
        tip.show(event, `${best.run.metrics.name} · ${c.task}`, [
          { color: best.run.color, label: "Duration", value: fmtDuration(c.durationS) },
          { label: "Model", value: c.effort ? `${c.model} (${c.effort})` : c.model },
          { label: "Item", value: c.item || "—" },
          { label: "Attempt", value: fmtInt(c.attempt) },
          { label: "Input / output tokens", value: `${fmtInt(c.inputTokens)} / ${fmtInt(c.outputTokens)}` },
          { label: "Result", value: c.success ? "Accepted" : `Failed (${fmtInt(c.errorCount)} errors)` },
        ])
      }

      return (
        <svg className="chart block" width={width} height={height} role="img" aria-label="Duration of each call per task">
          {tickValues.map((v) => (
            <g key={v}>
              <line className="gridline" x1={x(v)} x2={x(v)} y1={0} y2={bodyH} />
              <text x={x(v)} y={bodyH + 16} textAnchor="middle">{`${v} s`}</text>
            </g>
          ))}
          {rows.map((row, i) => (
            <g key={row.task}>
              {i > 0 && <line className="gridline" x1={0} x2={width} y1={i * rowH - 2} y2={i * rowH - 2} />}
              <text className="strong" x={0} y={row.top + (SUB * runs.length) / 2 + 4}>{row.task}</text>
              {row.lanes.map((lane) => (
                <g key={lane.run.metrics.name}>
                  {lane.calls.map((c) => (
                    <circle
                      key={c.id}
                      cx={x(c.durationS)}
                      cy={lane.cy + jitter(c.id)}
                      r={2.6}
                      style={{
                        fill: c.success ? lane.run.color : "none",
                        fillOpacity: 0.55,
                        stroke: c.success ? "none" : CRITICAL,
                        strokeWidth: 1.4,
                      }}
                    />
                  ))}
                  {lane.stat && (
                    <>
                      <line x1={x(lane.stat.p50S)} x2={x(lane.stat.p50S)} y1={lane.cy - 8} y2={lane.cy + 8} style={{ stroke: "var(--ink)", strokeWidth: 2 }} />
                      <line x1={x(lane.stat.p90S)} x2={x(lane.stat.p90S)} y1={lane.cy - 8} y2={lane.cy + 8} style={{ stroke: "var(--muted)", strokeWidth: 2, strokeDasharray: "2 2" }} />
                      {showStats && <text x={width - statW + 10} y={lane.cy + 4}>{statText(lane.stat)}</text>}
                    </>
                  )}
                </g>
              ))}
            </g>
          ))}
          <rect width={width} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setFocus(null); tip.hide() }} />
        </svg>
      )
    },
    [runs, order, rowH, height],
  )

  return (
    <Card id="durations" title="Seconds per call, by task" note="Each dot is one call. The solid tick marks the median (p50) and the dotted one the p90.">
      <RunLegend
        runs={runs}
        extra={
          <>
            <span className="inline-flex items-center gap-1.5"><Swatch color={CRITICAL} shape="ring" />Failed validation</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-ink" />p50</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 border-l-2 border-dotted border-muted" />p90</span>
          </>
        }
      />
      <div className="relative">
        <ChartBox minHeight={height}>{draw}</ChartBox>
        {focus && (
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height={height}>
            <circle cx={focus.px} cy={focus.py} r={5} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          </svg>
        )}
      </div>
    </Card>
  )
}
