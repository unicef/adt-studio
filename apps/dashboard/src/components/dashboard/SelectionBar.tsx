import { useEffect, useRef, useState } from "react"
import { BaselineBadge, ConversionPicker } from "../ConversionPicker"
import { Cover } from "../Cover"
import type { Workspace } from "../../hooks/useWorkspace"
import { MAX_RUNS } from "../../lib/run-view"

export function SelectionBar({ workspace }: { workspace: Workspace }) {
  const { selected, loads, toggle, makeBase } = workspace
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-2">
      {selected.map((s, i) => {
        const load = loads[s.name]
        return (
          <span key={s.name} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface py-1 pr-1 pl-1 text-sm">
            <Cover src={workspace.coverUrl(s.name)} name={s.name} className="aspect-[3/4] w-7 rounded-[3px]" />
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate font-medium text-ink" title={s.name}>{s.name}</span>
            {load?.status === "loading" && <span className="text-xs text-muted">reading…</span>}
            {load?.status === "error" && <span className="text-xs text-bad" title={load.message}>failed</span>}
            {i === 0 ? (
              <BaselineBadge />
            ) : (
              <button
                type="button"
                onClick={() => makeBase(s.name)}
                className="press rounded-full px-1.5 py-px text-[11px] text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
              >
                make baseline
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${s.name}`}
              onClick={() => toggle(s.name)}
              className="press grid size-6 place-items-center rounded-full text-muted hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
                <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        )
      })}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="press inline-flex items-center gap-1.5 rounded-full border border-dashed border-axis px-3 py-1.5 text-sm text-ink-2 hover:border-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent aria-expanded:border-solid aria-expanded:border-accent aria-expanded:text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
          <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {selected.length >= MAX_RUNS ? "Change conversions" : "Add conversion"}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose conversions" className="pop absolute top-full left-0 z-20 mt-2 flex max-h-[min(30rem,65dvh)] w-[min(32rem,calc(100vw-2rem))] flex-col rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10">
          <ConversionPicker workspace={workspace} variant="list" autoFocus />
        </div>
      )}
    </div>
  )
}
