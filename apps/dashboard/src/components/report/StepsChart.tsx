import { useCallback } from "react"
import { Card, RunLegend } from "../Card"
import { ChartBox, type Tip } from "../ChartBox"
import { fmtDuration, fmtMinutes } from "../../lib/format"
import { stepOrder } from "../../lib/metrics"
import type { RunView } from "../../lib/run-view"
import { linear, minuteTicks, textWidth } from "../../lib/scale"

const BAR = 9
const LANE = 14
const AXIS = 24

export function StepsChart({ runs }: { runs: RunView[] }) {
  const order = stepOrder(runs.map((r) => r.metrics))
  const rowH = LANE * runs.length + 10
  const height = order.length * rowH + AXIS

  const draw = useCallback(
    (width: number, tip: Tip) => {
      const all = runs.flatMap((r) => r.metrics.steps)
      const labelW = textWidth(order) + 12
      const endW = textWidth(all.map((s) => fmtDuration(s.durationS))) + 10
      const xMax = Math.max(1, ...all.map((s) => s.endS))
      const x = linear([0, xMax], [labelW, Math.max(labelW + 40, width - endW)])
      const tickValues = minuteTicks(xMax, Math.max(2, Math.floor((width - labelW - endW) / 70)))
      const bodyH = order.length * rowH
      return (
        <svg className="chart block" width={width} height={height} role="img" aria-label="Duration of each step per conversion">
          {tickValues.map((v) => (
            <g key={v}>
              <line className="gridline" x1={x(v)} x2={x(v)} y1={0} y2={bodyH} />
              <text x={x(v)} y={bodyH + 16} textAnchor="middle">{fmtMinutes(v)}</text>
            </g>
          ))}
          {order.map((step, i) => (
            <g
              key={step}
              transform={`translate(0,${i * rowH})`}
              onMouseMove={(event) =>
                tip.show(
                  event,
                  step,
                  runs.map((r) => {
                    const s = r.metrics.steps.find((q) => q.step === step)
                    return { color: r.color, label: r.metrics.name, value: s ? `${fmtDuration(s.durationS)} (${fmtMinutes(s.startS)} → ${fmtMinutes(s.endS)})` : "—" }
                  }),
                )
              }
              onMouseLeave={tip.hide}
            >
              <rect width={width} height={rowH} fill="transparent" />
              <text className="strong" x={0} y={rowH / 2 + 4}>{step}</text>
              {runs.map((r, j) => {
                const s = r.metrics.steps.find((q) => q.step === step)
                if (!s) return null
                const y = 5 + j * LANE
                return (
                  <g key={r.metrics.name}>
                    <rect x={x(s.startS)} y={y} width={Math.max(2, x(s.endS) - x(s.startS))} height={BAR} rx={2} style={{ fill: r.color }} />
                    <text x={x(s.endS) + 6} y={y + 9}>{fmtDuration(s.durationS)}</text>
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      )
    },
    [runs, order, rowH, height],
  )

  return (
    <Card id="steps" title="Pipeline steps" note="Start and end of each step (step_runs), in minutes since the conversion started. web-rendering includes activities and visual review.">
      <RunLegend runs={runs} />
      <ChartBox minHeight={height}>{draw}</ChartBox>
    </Card>
  )
}
