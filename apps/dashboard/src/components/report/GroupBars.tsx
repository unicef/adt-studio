import { useCallback } from "react"
import { ChartBox, type Tip, type TipRow } from "../ChartBox"
import type { RunView } from "../../lib/run-view"
import { linear, textWidth } from "../../lib/scale"

export interface GroupRow {
  label: string
  values: number[]
  tip: TipRow[]
}

interface GroupBarsProps {
  runs: RunView[]
  rows: GroupRow[]
  format: (n: number) => string
  label: string
}

const BAR = 10
const LANE = 12

export function GroupBars({ runs, rows, format, label }: GroupBarsProps) {
  const rowH = 20 + LANE * runs.length + 8
  const height = rows.length * rowH

  const draw = useCallback(
    (width: number, tip: Tip) => {
      const valueW = textWidth(rows.flatMap((r) => r.values.map(format))) + 8
      const max = Math.max(1, ...rows.flatMap((r) => r.values))
      const x = linear([0, max], [0, Math.max(40, width - valueW)])
      return (
        <svg className="chart block" width={width} height={height} role="img" aria-label={label}>
          {rows.map((row, i) => (
            <g key={row.label} transform={`translate(0,${i * rowH})`} onMouseMove={(event) => tip.show(event, row.label, row.tip)} onMouseLeave={tip.hide}>
              <rect width={width} height={rowH - 2} fill="transparent" />
              <text className="strong" x={0} y={13}>{row.label}</text>
              {runs.map((run, j) => {
                const value = row.values[j] ?? 0
                const y = 20 + j * LANE
                return (
                  <g key={run.metrics.name}>
                    {value > 0 && <rect x={0} y={y} width={Math.max(2, x(value))} height={BAR} rx={3} style={{ fill: run.color }} />}
                    <text x={x(value) + 6} y={y + 9}>{format(value)}</text>
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      )
    },
    [runs, rows, format, label, rowH, height],
  )

  return <ChartBox minHeight={height}>{draw}</ChartBox>
}
