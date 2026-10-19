import { useState } from "react"
import { Swatch } from "./Card"
import { fmtBytes, fmtDateTime } from "../lib/format"
import { MAX_RUNS } from "../lib/run-view"
import type { ConversionEntry } from "../lib/types"

export type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string }

interface ConversionPickerProps {
  conversions: ConversionEntry[]
  selected: { name: string; color: string }[]
  loads: Record<string, LoadState>
  onToggle: (conversion: ConversionEntry) => void
  onMakeBase: (name: string) => void
}

export function ConversionPicker({ conversions, selected, loads, onToggle, onMakeBase }: ConversionPickerProps) {
  const [filter, setFilter] = useState("")
  const visible = conversions.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const full = selected.length >= MAX_RUNS

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          {conversions.length} conversions found. Check up to {MAX_RUNS}; the first one checked is the baseline for the changes.
        </p>
        <input
          id="conversion-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name"
          aria-label="Filter conversions by name"
          className="w-56 max-w-full rounded-md border border-line bg-page px-2 py-1 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ink"
        />
      </div>
      <ul className="grid max-h-72 gap-1 overflow-auto [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
        {visible.map((conversion) => {
          const index = selected.findIndex((s) => s.name === conversion.name)
          const isSelected = index >= 0
          const load = loads[conversion.name]
          return (
            <li key={conversion.name}>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${isSelected ? "border-ink-2 bg-page" : "border-transparent hover:bg-page"} ${!isSelected && full ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input type="checkbox" checked={isSelected} disabled={!isSelected && full} onChange={() => onToggle(conversion)} className="accent-[var(--accent)]" />
                {isSelected && <Swatch color={selected[index].color} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{conversion.name}</span>
                  <span className="block text-xs text-muted">
                    {fmtDateTime(conversion.dbModified)} · {fmtBytes(conversion.dbSize)}
                    {load?.status === "loading" && " · reading…"}
                    {load?.status === "error" && <span className="text-bad"> · {load.message}</span>}
                  </span>
                </span>
                {isSelected && index === 0 && <span className="rounded border border-line px-1 text-[11px] text-muted">baseline</span>}
                {isSelected && index > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      onMakeBase(conversion.name)
                    }}
                    className="rounded px-1 text-[11px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ink"
                  >
                    use as baseline
                  </button>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
