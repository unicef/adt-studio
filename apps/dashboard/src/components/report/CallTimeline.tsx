import { useCallback, useMemo, type MouseEvent } from "react"
import { Card, RunLegend, Swatch } from "../Card"
import { ChartBox, type Tip } from "../ChartBox"
import { fmtDuration, fmtInt, fmtMinutes } from "../../lib/format"
import { taskOrder } from "../../lib/metrics"
import { CRITICAL, type RunView } from "../../lib/run-view"
import { linear, minuteTicks, textWidth } from "../../lib/scale"
import type { CallSpan } from "../../lib/types"

const LANE = 4
const HEAD = 22
const AXIS = 24
const GAP = 18

interface Band {
  task: string
  calls: (CallSpan & { lane: number })[]
  top: number
  height: number
}

interface Panel {
  run: RunView
  bands: Band[]
  top: number
  height: number
}

function layout(runs: RunView[], order: string[]): { panels: Panel[]; height: number } {
  let top = 0
  const panels = runs.map((run) => {
    let y = top + HEAD
    const bands = order.map((task) => {
      const ends: number[] = []
      const calls = run.metrics.callSpans
        .filter((c) => c.task === task)
        .sort((a, b) => a.startS - b.startS)
        .map((c) => {
          let lane = ends.findIndex((end) => end <= c.startS)
          if (lane < 0) {
            lane = ends.length
            ends.push(0)
          }
          ends[lane] = c.startS + c.durationS
          return { ...c, lane }
        })
      const band = { task, calls, top: y, height: Math.max(ends.length * LANE, 12) + 6 }
      y += band.height
      return band
    })
    const panel = { run, bands, top, height: y - top + AXIS }
    top += panel.height + GAP
    return panel
  })
  return { panels, height: Math.max(0, top - GAP) }
}

export function CallTimeline({ runs }: { runs: RunView[] }) {
  const order = useMemo(() => taskOrder(runs.map((r) => r.metrics)), [runs])
  const { panels, height } = useMemo(() => layout(runs, order), [runs, order])

  const draw = useCallback(
    (width: number, tip: Tip) => {
      const labelW = textWidth(order) + 12
      const xMax = Math.max(1, ...runs.map((r) => r.metrics.totalS))
      const x = linear([0, xMax], [labelW, width - 8])
      const tickValues = minuteTicks(xMax, Math.max(2, Math.floor((width - labelW) / 70)))
      const tolerance = (xMax / width) * 3

      const onMove = (event: MouseEvent<SVGRectElement>) => {
        const box = event.currentTarget.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        const time = x.invert(px)
        for (const panel of panels) {
          const band = panel.bands.find((b) => py >= b.top && py < b.top + b.height)
          if (!band) continue
          const lane = Math.floor((py - band.top - 3) / LANE)
          const call = band.calls.find((c) => c.lane === lane && c.startS - tolerance <= time && c.startS + c.durationS + tolerance >= time)
          if (!call) break
          tip.show(event, `${panel.run.metrics.name} · ${call.task}`, [
            { label: "Model", value: call.effort ? `${call.model} (${call.effort})` : call.model },
            { label: "Item", value: call.item || "—" },
            { label: "Attempt", value: fmtInt(call.attempt) },
            { label: "Start", value: fmtDuration(call.startS) },
            { label: "Duration", value: fmtDuration(call.durationS) },
            { label: "Input / output tokens", value: `${fmtInt(call.inputTokens)} / ${fmtInt(call.outputTokens)}` },
            { label: "Result", value: call.success ? "Accepted" : `Failed (${fmtInt(call.errorCount)} errors)` },
          ])
          return
        }
        tip.hide()
      }

      return (
        <svg className="chart block" width={width} height={height} role="img" aria-label="Timeline of LLM calls">
          {panels.map((panel) => {
            const bodyTop = panel.top + HEAD
            const bodyBottom = panel.top + panel.height - AXIS
            return (
              <g key={panel.run.metrics.name}>
                <text className="strong" x={0} y={panel.top + 14}>{panel.run.metrics.name}</text>
                {tickValues.map((v) => (
                  <g key={v}>
                    <line className="gridline" x1={x(v)} x2={x(v)} y1={bodyTop} y2={bodyBottom} />
                    <text x={x(v)} y={bodyBottom + 16} textAnchor={x(v) > width - 30 ? "end" : "middle"}>{fmtMinutes(v)}</text>
                  </g>
                ))}
                {panel.bands.map((band) => (
                  <g key={band.task}>
                    <text x={0} y={band.top + band.height / 2 + 4}>{band.task}</text>
                    {band.calls.map((c) => (
                      <rect
                        key={c.id}
                        x={x(c.startS)}
                        y={band.top + 3 + c.lane * LANE}
                        width={Math.max(1.5, x(c.startS + c.durationS) - x(c.startS))}
                        height={LANE - 1}
                        style={{ fill: c.success ? panel.run.color : CRITICAL }}
                      />
                    ))}
                  </g>
                ))}
              </g>
            )
          })}
          <rect width={width} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={tip.hide} />
        </svg>
      )
    },
    [runs, order, panels, height],
  )

  return (
    <Card id="timeline" title="Every call across the conversion" note="One bar per call, from start to end, stacked when calls run in parallel. Hover to see the call.">
      <RunLegend
        runs={runs}
        extra={
          <span className="inline-flex items-center gap-1.5">
            <Swatch color={CRITICAL} shape="bar" />
            Failed validation
          </span>
        }
      />
      <ChartBox minHeight={height}>{draw}</ChartBox>
    </Card>
  )
}
