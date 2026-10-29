import { BaselineBadge } from "../ConversionPicker"
import { Cover } from "../Cover"
import type { LoadState, Selection } from "../../hooks/useWorkspace"
import { fmtDateTime } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

interface RunColumnHeaderProps {
  selection: Selection
  cover: string
  run: RunView | undefined
  load: LoadState | undefined
  isBase: boolean
  onMakeBase: () => void
  onRemove: () => void
}

export function RunColumnHeader({ selection, cover, run, load, isBase, onMakeBase, onRemove }: RunColumnHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 text-left">
      <div className="flex items-start gap-2.5">
        <Cover src={cover} name={selection.name} className="aspect-[3/4] w-11 rounded-[3px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span aria-hidden="true" className="h-1 w-8 rounded-full" style={{ background: selection.color }} />
          <span className="text-sm leading-snug font-medium break-words text-ink">{selection.name}</span>
        </span>
        <button
          type="button"
          aria-label={`Remove ${selection.name}`}
          onClick={onRemove}
          className="press -mt-0.5 -mr-1 grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
            <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {isBase ? (
          <BaselineBadge />
        ) : (
          <button
            type="button"
            onClick={onMakeBase}
            className="press rounded-full border border-line px-1.5 py-px text-[11px] text-accent hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
          >
            make baseline
          </button>
        )}
        {load?.status === "loading" && <span className="text-xs text-muted">reading…</span>}
        {load?.status === "error" && <span className="text-xs text-bad">{load.message}</span>}
      </div>
      {run && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <dt>started</dt>
          <dd className="truncate text-ink-2 tabular-nums">{fmtDateTime(run.metrics.startedAt)}</dd>
          <dt>models</dt>
          <dd className="text-ink-2 break-words">{run.metrics.models.join(", ")}</dd>
          <dt>effort</dt>
          <dd className="text-ink-2">{run.metrics.efforts.length ? run.metrics.efforts.join(", ") : "not recorded"}</dd>
        </dl>
      )}
    </div>
  )
}
