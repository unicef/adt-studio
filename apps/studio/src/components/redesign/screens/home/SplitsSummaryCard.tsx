import { Trans, Plural } from "@lingui/react/macro"
import { Scissors } from "lucide-react"
import type { BookSummary } from "@/api/client"

export interface SplitsSummaryCardProps {
  books: BookSummary[]
  onOpen: () => void
}

/**
 * Home "Jump back in" side-card. Shows a live split-coverage summary when the
 * user has active splits, otherwise a per-section "No active splits" empty
 * (design 1a/1b). Derived entirely from real `book.split` data.
 */
export function SplitsSummaryCard({ books, onOpen }: SplitsSummaryCardProps) {
  const active = books.filter((b) => b.split && !b.split.fullyMerged)

  if (active.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-2.5 rounded-2xl border border-dashed bg-card/70 p-4">
        <span className="grid size-9 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
          <Scissors className="size-[18px]" />
        </span>
        <div className="text-[13px] font-semibold">
          <Trans>No active splits</Trans>
        </div>
        <div className="text-[11.5px] leading-[1.45] text-muted-foreground">
          <Trans>Split a book to hand parts to collaborators.</Trans>
        </div>
      </div>
    )
  }

  const total = active.reduce((n, b) => n + (b.split?.totalPages ?? 0), 0)
  const merged = active.reduce((n, b) => n + (b.split?.mergedPages ?? 0), 0)
  const split = active.reduce((n, b) => n + (b.split?.splitPages ?? 0), 0)
  const mergedPct = total ? (merged / total) * 100 : 0
  const outPct = total ? (Math.max(0, split - merged) / total) * 100 : 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-1 flex-col gap-[7px] rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-brand-300"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-[34px] place-items-center rounded-[9px] bg-brand-50 text-brand-700">
          <Scissors className="size-5" />
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          <Plural value={active.length} one="# book" other="# books" />
        </span>
      </div>
      <div className="text-sm font-semibold">
        <Trans>Splits in progress</Trans>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-brand-600" style={{ width: `${mergedPct.toFixed(1)}%` }} />
        <div className="bg-brand-300" style={{ width: `${outPct.toFixed(1)}%` }} />
      </div>
      <div className="text-xs leading-[1.45] text-muted-foreground">
        <Trans>
          {merged} of {split} pages merged back
        </Trans>
      </div>
    </button>
  )
}
