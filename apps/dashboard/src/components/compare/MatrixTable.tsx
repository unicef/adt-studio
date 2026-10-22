import type { ReactNode } from "react"
import { RunColumnHeader } from "./RunColumnHeader"
import type { Workspace } from "../../hooks/useWorkspace"
import type { RunView } from "../../lib/run-view"

interface MatrixTableProps {
  workspace: Workspace
  runs: RunView[]
  legend: string
  children: ReactNode
}

export function MatrixTable({ workspace, runs, legend, children }: MatrixTableProps) {
  const { selected, loads, toggle, makeBase, coverUrl } = workspace
  const ready = runs.length === selected.length && runs.length > 0

  return (
    <div className="overflow-x-auto lg:overflow-visible">
      <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0">
        <colgroup>
          <col className="w-[15rem]" />
          {selected.map((s) => (
            <col key={s.name} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="bg-page pr-4 pb-3 text-left align-bottom font-normal max-lg:sticky max-lg:left-0 max-lg:z-[2] lg:sticky lg:top-14 lg:z-10 lg:pt-3">
              <span className="block text-xs text-muted">{legend}</span>
            </th>
            {selected.map((s, i) => (
              <th key={s.name} className="bg-page px-1.5 pb-3 align-top font-normal lg:sticky lg:top-14 lg:z-10 lg:pt-3">
                <RunColumnHeader
                  selection={s}
                  cover={coverUrl(s.name)}
                  run={runs.find((r) => r.metrics.name === s.name)}
                  load={loads[s.name]}
                  isBase={i === 0}
                  onMakeBase={() => makeBase(s.name)}
                  onRemove={() => toggle(s.name)}
                />
              </th>
            ))}
          </tr>
        </thead>
        {ready && <tbody className="enter">{children}</tbody>}
      </table>
    </div>
  )
}

export function GroupRow({ span, title, children }: { span: number; title: string; children?: ReactNode }) {
  return (
    <tr>
      <th colSpan={span} scope="colgroup" className="pt-6 pb-3 text-left font-normal">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-medium tracking-wider text-muted uppercase">{title}</span>
          {children}
        </div>
      </th>
    </tr>
  )
}

export function MetricPicker<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (key: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={m.key === value}
          onClick={() => onChange(m.key)}
          className="press rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white"
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

export const LOWER_IS_BETTER = "Lower is better for every row. The bold value is the lowest of its row; badges compare with the baseline."
