import { fmtPct } from "../../lib/format"
import { relativeChange } from "../../lib/metrics"
import type { RunView } from "../../lib/run-view"

const magnitude = (change: number) => fmtPct(Math.abs(change)).replace("+", "")

function verdict(base: RunView, run: RunView): string {
  const time = relativeChange(base.metrics.totalS, run.metrics.totalS)
  const cost = relativeChange(base.metrics.costUsd, run.metrics.costUsd)
  const parts: string[] = []
  if (time !== null) parts.push(time === 0 ? "took the same time" : `was ${magnitude(time)} ${time < 0 ? "faster" : "slower"}`)
  if (cost !== null) parts.push(cost === 0 ? "cost the same" : `${magnitude(cost)} ${cost < 0 ? "cheaper" : "more expensive"}`)
  const failures = `${run.metrics.failedCalls} failed calls against ${base.metrics.failedCalls}`
  return parts.length ? `${parts.join(" and ")} than the baseline, with ${failures}.` : `had ${failures}.`
}

export function Verdicts({ runs }: { runs: RunView[] }) {
  const [base, ...others] = runs
  if (others.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {others.map((run) => (
        <li key={run.metrics.name} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full" style={{ background: run.color }} />
          <p className="text-[15px] leading-relaxed text-pretty text-ink-2">
            <strong className="font-medium text-ink">{run.metrics.name}</strong> {verdict(base, run)}
          </p>
        </li>
      ))}
    </ul>
  )
}
