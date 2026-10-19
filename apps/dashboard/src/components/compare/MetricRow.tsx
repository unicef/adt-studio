import type { ReactNode } from "react"
import { DeltaPill } from "../report/Delta"
import { relativeChange } from "../../lib/metrics"

interface MetricRowProps {
  label: string
  note?: ReactNode
  values: (number | null)[]
  colors: string[]
  format: (n: number) => string
}

export function MetricRow({ label, note, values, colors, format }: MetricRowProps) {
  const present = values.filter((v): v is number => v !== null)
  const max = Math.max(0, ...present)
  const min = Math.min(...present)
  const markLowest = present.length > 1 && min !== max
  const [base] = values

  return (
    <RowShell label={label} note={note}>
      {values.map((value, i) => (
        <td key={i} className="px-3 py-3 align-top group-hover:bg-ink/[0.02]">
          {value === null ? (
            <span className="text-sm text-muted">—</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`text-sm tabular-nums ${markLowest && value === min ? "font-semibold text-ink" : "text-ink-2"}`}>{format(value)}</span>
                {i > 0 && base !== null && <DeltaPill change={relativeChange(base, value)} />}
              </div>
              <span className="block h-1 overflow-hidden rounded-full bg-ink/[0.05]">
                <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: colors[i], opacity: 0.85 }} />
              </span>
            </div>
          )}
        </td>
      ))}
    </RowShell>
  )
}

export function RowShell({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <tr className="group border-t border-line">
      <th scope="row" className="bg-page py-3 pr-4 text-left align-top font-normal group-hover:bg-ink/[0.02] max-lg:sticky max-lg:left-0 max-lg:z-[1]">
        <span className="block text-sm font-medium break-words text-ink">{label}</span>
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{note}</span>}
      </th>
      {children}
    </tr>
  )
}
