import type { ReactNode } from "react"
import type { RunView } from "../lib/run-view"

interface CardProps {
  id?: string
  title: string
  note?: ReactNode
  children: ReactNode
}

export function Card({ id, title, note, children }: CardProps) {
  return (
    <section id={id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-ink">{title}</h3>
        {note && <p className="max-w-[80ch] text-xs leading-relaxed text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      {children}
    </section>
  )
}

export function Swatch({ color, shape = "square" }: { color: string; shape?: "square" | "ring" | "bar" }) {
  if (shape === "ring") return <span className="inline-block size-2.5 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: color }} />
  if (shape === "bar") return <span className="inline-block h-1 w-3.5 shrink-0 rounded-sm" style={{ background: color }} />
  return <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: color }} />
}

export function RunLegend({ runs, extra }: { runs: RunView[]; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {runs.map((run) => (
        <span key={run.metrics.name} className="inline-flex items-center gap-1.5">
          <Swatch color={run.color} />
          {run.metrics.name}
        </span>
      ))}
      {extra}
    </div>
  )
}
