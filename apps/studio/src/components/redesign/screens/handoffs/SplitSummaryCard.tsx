import { useNavigate } from "@tanstack/react-router"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { ChevronDown, CheckCheck, Clock, Check, GitMerge, BookOpen } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useSplitStatus } from "@/hooks/use-parts"
import { BookCover } from "@/components/redesign/shared/BookCover"
import { toBookVM } from "@/components/redesign/shared/data"

export interface SplitSummaryCardProps {
  book: BookSummary
  locale: string
  open: boolean
  onToggle: () => void
}

/** Coordinator-side split, derived from real `book.split`; ranges via useSplitStatus on expand. */
export function SplitSummaryCard({ book, locale, open, onToggle }: SplitSummaryCardProps) {
  const navigate = useNavigate()
  const openBook = () => navigate({ to: "/books/$label/$step", params: { label: book.label, step: "book" } })
  const vm = toBookVM(book, locale)
  const split = book.split!
  const assembled = split.fullyMerged
  const total = split.totalPages || 1
  const mergedPct = (split.mergedPages / total) * 100
  const outPct = (Math.max(0, split.splitPages - split.mergedPages) / total) * 100

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted">
        <div className="h-[61px] w-[46px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
          <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{vm.displayTitle}</h3>
            <Badge variant="outline" className="shrink-0 gap-1 px-2 text-[10.5px]">
              {vm.lang}
            </Badge>
            <Badge variant={assembled ? "success" : "warning"} className="shrink-0 gap-1 px-2 text-[10.5px]">
              {assembled ? <CheckCheck className="size-3" /> : <Clock className="size-3" />}
              {assembled ? <Trans>Assembled</Trans> : <Trans>In progress</Trans>}
            </Badge>
          </div>
          <div className="my-1 mb-2.5 text-[12.5px] text-muted-foreground">
            <Trans>
              {split.totalPages} pages · <Plural value={split.exportedParts} one="# part" other="# parts" />
            </Trans>
          </div>
          <div className="flex h-2 max-w-[440px] gap-0.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-brand-600" style={{ width: `${mergedPct.toFixed(1)}%` }} />
            <div className="bg-brand-300" style={{ width: `${outPct.toFixed(1)}%` }} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums">{Math.round(mergedPct)}%</div>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <Trans>merged</Trans>
          </div>
        </div>
        <ChevronDown className={cn("size-[18px] shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && <SplitParts label={book.label} assembled={assembled} onManage={openBook} />}
    </div>
  )
}

function rangeMerged(r: { startPage: number; endPage: number }, merged: { startPage: number; endPage: number }[]) {
  return merged.some((m) => m.startPage <= r.startPage && m.endPage >= r.endPage)
}

function SplitParts({ label, assembled, onManage }: { label: string; assembled: boolean; onManage: () => void }) {
  const { data: status, isLoading } = useSplitStatus(label)
  const { t } = useLingui()

  return (
    <div>
      {isLoading ? (
        <div className="border-t px-5 py-4 text-xs text-muted-foreground">
          <Trans>Loading parts…</Trans>
        </div>
      ) : (
        (status?.exported ?? []).map((r) => {
          const merged = rangeMerged(r, status?.mergedRanges ?? [])
          return (
            <div key={`${r.startPage}-${r.endPage}`} className="flex items-center gap-3.5 border-t px-5 py-3">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {merged ? <CheckCheck className="size-3.5" /> : <Clock className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t`pg ${r.startPage}–${r.endPage}`}</div>
              </div>
              <Badge variant={merged ? "success" : "warning"} className="min-w-[132px] justify-center gap-1 px-2 text-[10.5px]">
                {merged ? <Check className="size-3" /> : <Clock className="size-3" />}
                {merged ? <Trans>Merged back</Trans> : <Trans>Awaiting return</Trans>}
              </Badge>
            </div>
          )
        })
      )}
      <div className={cn("flex items-center gap-3.5 border-t px-5 py-4", assembled ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-brand-50")}>
        <GitMerge className={cn("size-5", assembled ? "text-emerald-700 dark:text-emerald-400" : "text-brand-700")} />
        <div className="flex-1 text-[13.5px] font-semibold">
          {assembled ? (
            <span className="text-emerald-800 dark:text-emerald-300">
              <Trans>All parts merged — book assembled</Trans>
            </span>
          ) : (
            <span className="text-brand-800">
              <Trans>Import returned parts and merge them back in the book.</Trans>
            </span>
          )}
        </div>
        <Button size="sm" variant={assembled ? "outline" : "default"} onClick={onManage}>
          <BookOpen className="size-3.5" />
          <Trans>Manage in book</Trans>
        </Button>
      </div>
    </div>
  )
}
