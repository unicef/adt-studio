import { useState } from "react"
import { Cover } from "./Cover"
import type { LoadState, Workspace } from "../hooks/useWorkspace"
import { fmtBytes, fmtDateTime } from "../lib/format"
import { MAX_RUNS } from "../lib/run-view"
import type { ConversionEntry } from "../lib/types"

interface ConversionPickerProps {
  workspace: Workspace
  variant?: "grid" | "list"
  autoFocus?: boolean
}

interface ItemProps {
  conversion: ConversionEntry
  cover: string
  color: string | null
  isBase: boolean
  blocked: boolean
  load: LoadState | undefined
  onToggle: () => void
  onMakeBase: () => void
}

export function ConversionPicker({ workspace, variant = "grid", autoFocus = false }: ConversionPickerProps) {
  const { conversions, selected, loads, toggle, makeBase, coverUrl } = workspace
  const [filter, setFilter] = useState("")
  const visible = conversions.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const full = selected.length >= MAX_RUNS
  const list = variant === "list"
  const Item = list ? ListItem : GridItem

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${list ? "flex-1" : ""}`}>
      <div className={`flex gap-2 ${list ? "flex-col" : "flex-wrap items-center justify-between"}`}>
        <p className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink-2">{conversions.length} conversions.</span> Check up to {MAX_RUNS}; the first one checked is the baseline for the changes.
        </p>
        <input
          type="search"
          value={filter}
          autoFocus={autoFocus}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name"
          aria-label="Filter conversions by name"
          className={`${list ? "w-full" : "w-56 max-w-full"} rounded-md border border-line bg-page px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent`}
        />
      </div>
      <ul
        className={`grid overflow-auto overscroll-contain ${list ? "min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-0.5 max-lg:max-h-[50dvh]" : "max-h-[30rem] gap-x-3 gap-y-4 p-1 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]"}`}
      >
        {visible.map((conversion) => {
          const index = selected.findIndex((s) => s.name === conversion.name)
          return (
            <li key={conversion.name}>
              <Item
                conversion={conversion}
                cover={coverUrl(conversion.name)}
                color={index >= 0 ? selected[index].color : null}
                isBase={index === 0}
                blocked={index < 0 && full}
                load={loads[conversion.name]}
                onToggle={() => toggle(conversion.name)}
                onMakeBase={() => makeBase(conversion.name)}
              />
            </li>
          )
        })}
        {visible.length === 0 && <li className="col-span-full px-2.5 py-3 text-sm text-muted">No conversion matches “{filter}”.</li>}
      </ul>
    </div>
  )
}

function GridItem({ conversion, cover, color, isBase, blocked, load, onToggle, onMakeBase }: ItemProps) {
  const isSelected = color !== null
  return (
    <label className={`group relative flex flex-col gap-2 ${blocked ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}>
      <input type="checkbox" checked={isSelected} disabled={blocked} onChange={onToggle} className="peer sr-only" />
      <span
        className="press relative block rounded-md outline-offset-4 group-active:scale-[0.98] peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
        style={isSelected ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}` } : undefined}
      >
        <Cover src={cover} name={conversion.name} className={`aspect-[3/4] w-full rounded-md transition-[filter] duration-200 ${isSelected ? "" : "group-hover:brightness-110"}`} />
        <span className="absolute top-1.5 left-1.5">
          <CheckMark color={color} />
        </span>
        {isSelected && (
          <span className="absolute inset-x-1.5 bottom-1.5 flex justify-center">
            {isBase ? (
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase backdrop-blur-sm">baseline</span>
            ) : (
              <MakeBaseButton onClick={onMakeBase} className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm hover:bg-black/85" />
            )}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className={`line-clamp-2 text-[13px] leading-snug break-words ${isSelected ? "font-medium text-ink" : "text-ink-2"}`} title={conversion.name}>{conversion.name}</span>
        <span className="text-[11px] tabular-nums text-muted">
          {fmtDateTime(conversion.dbModified)} · {fmtBytes(conversion.dbSize)}
        </span>
        <LoadNote load={load} />
      </span>
    </label>
  )
}

function ListItem({ conversion, cover, color, isBase, blocked, load, onToggle, onMakeBase }: ItemProps) {
  const isSelected = color !== null
  return (
    <label
      className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ${isSelected ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]"} ${blocked ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <input type="checkbox" checked={isSelected} disabled={blocked} onChange={onToggle} className="peer sr-only" />
      <span className="relative shrink-0 rounded-[3px] outline-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
        <Cover src={cover} name={conversion.name} className="aspect-[3/4] w-9 rounded-[3px]" />
        <span className="absolute -top-1 -left-1">
          <CheckMark color={color} small />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${isSelected ? "font-medium text-ink" : "text-ink-2"}`} title={conversion.name}>{conversion.name}</span>
        <span className="block text-xs tabular-nums text-muted">
          {fmtDateTime(conversion.dbModified)} · {fmtBytes(conversion.dbSize)}
        </span>
        <LoadNote load={load} />
      </span>
      {isSelected && isBase && <BaselineBadge />}
      {isSelected && !isBase && <MakeBaseButton onClick={onMakeBase} className="shrink-0 rounded px-1 text-[11px] text-accent opacity-80 hover:underline hover:opacity-100" />}
    </label>
  )
}

function CheckMark({ color, small = false }: { color: string | null; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center rounded-full border transition-[background-color,border-color,opacity] duration-150 ${small ? "size-4" : "size-5"} ${color ? "border-transparent" : "border-white/70 bg-black/35 opacity-0 backdrop-blur-sm group-hover:opacity-100"}`}
      style={color ? { background: color } : undefined}
    >
      {color && (
        <svg viewBox="0 0 12 12" className={`${small ? "size-2.5" : "size-3"} text-white`}>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

function MakeBaseButton({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={`press focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      use as baseline
    </button>
  )
}

function LoadNote({ load }: { load: LoadState | undefined }) {
  if (load?.status === "loading") return <span className="block text-[11px] text-muted">reading…</span>
  if (load?.status === "error") return <span className="block text-[11px] text-bad">{load.message}</span>
  return null
}

export function BaselineBadge() {
  return <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">baseline</span>
}
