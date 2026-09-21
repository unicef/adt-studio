import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight, CheckCheck, Clock, BookOpen, FolderDown } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useSplitStatus } from "@/hooks/use-parts"
import { BookCover } from "../../BookCover"
import { toBookVM } from "../../data"
import { useOpenBook } from "../../use-open-book"
import {
  StatusBadge, SegBar, STATUS_META, partsOf, segmentsOf, fallbackSegments, approxMergedParts,
  type CoordinatorPart,
} from "./status"

export interface SplitMasterDetailProps {
  books: BookSummary[]
  locale: string
}

export function SplitMasterDetail({ books, locale }: SplitMasterDetailProps) {
  const [selLabel, setSelLabel] = useState(books[0]?.label)
  const selected = books.find((b) => b.label === selLabel) ?? books[0]

  return (
    <div className="grid grid-cols-[300px_1fr] gap-4">
      <div className="space-y-2">
        {books.map((book) => (
          <RailItem key={book.label} book={book} locale={locale} active={book.label === selected.label} onSelect={() => setSelLabel(book.label)} />
        ))}
      </div>
      <div key={selected.label} className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none starting:opacity-0">
        <SplitDetail book={selected} locale={locale} />
      </div>
    </div>
  )
}

function RailItem({ book, locale, active, onSelect }: { book: BookSummary; locale: string; active: boolean; onSelect: () => void }) {
  const { data: status } = useSplitStatus(book.label)
  const vm = toBookVM(book, locale)
  const split = book.split!
  const parts = status ? partsOf(status) : null
  const segments = parts ? segmentsOf(parts) : fallbackSegments(split)
  const merged = parts ? parts.filter((p) => p.status === "merged").length : approxMergedParts(split)
  const total = parts ? parts.length : split.exportedParts

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ease-[cubic-bezier(0.23,1,0.32,1)]",
        active ? "border-brand-300 bg-brand-50/60 dark:bg-brand-950/20" : "bg-card hover:bg-muted/50",
      )}
    >
      <div className="h-[45px] w-[34px] shrink-0 overflow-hidden rounded-[4px] shadow-sm">
        <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{vm.displayTitle}</div>
        <div className="mt-1 flex items-center gap-2">
          <SegBar segments={segments} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{merged}/{total}</span>
        </div>
      </div>
      <ChevronRight className={cn("size-4 shrink-0 transition-colors", active ? "text-brand-500" : "text-muted-foreground/50")} />
    </button>
  )
}

function SplitDetail({ book, locale }: { book: BookSummary; locale: string }) {
  const openBookInPipeline = useOpenBook()
  const { t } = useLingui()
  const { data: status, isLoading } = useSplitStatus(book.label)
  const vm = toBookVM(book, locale)
  const split = book.split!
  const assembled = split.fullyMerged
  const parts = status ? partsOf(status) : null
  const segments = parts ? segmentsOf(parts) : fallbackSegments(split)
  const merged = parts ? parts.filter((p) => p.status === "merged").length : approxMergedParts(split)
  const total = parts ? parts.length : split.exportedParts

  const openBook = () => openBookInPipeline(book.label)

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="h-[61px] w-[46px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
          <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{vm.displayTitle}</h3>
            <Badge variant="outline" className="shrink-0 gap-1 px-2 text-[10.5px]">{vm.lang}</Badge>
            <Badge variant={assembled ? "success" : "warning"} className="shrink-0 gap-1 px-2 text-[10.5px]">
              {assembled ? <CheckCheck className="size-3" /> : <Clock className="size-3" />}
              {assembled ? <Trans>Assembled</Trans> : <Trans>In progress</Trans>}
            </Badge>
          </div>
          <div className="my-1 mb-2.5 text-[12.5px] text-muted-foreground">
            {t`${split.totalPages} pages · split into ${split.exportedParts} parts`}
          </div>
          <SegBar segments={segments} className="max-w-[520px]" />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums">{merged}/{total}</div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"><Trans>merged</Trans></div>
        </div>
      </div>

      {isLoading && !parts ? (
        <div className="border-t px-5 py-6 text-center text-xs text-muted-foreground"><Trans>Loading parts…</Trans></div>
      ) : (
        (parts ?? []).map((part) => <PartRow key={`${part.range.startPage}-${part.range.endPage}`} part={part} onView={openBook} />)
      )}

      <MergeFooter merged={merged} total={total} assembled={assembled} onManage={openBook} />
    </div>
  )
}

function ImportPartButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/books/import">
        <FolderDown className="size-3.5" /> <Trans>Import returned .zip</Trans>
      </Link>
    </Button>
  )
}

function PartRow({ part, onView }: { part: CoordinatorPart; onView: () => void }) {
  const { t } = useLingui()
  const { Icon, iconClass } = STATUS_META[part.status]
  return (
    <div className="flex items-center gap-3.5 border-t px-5 py-3 transition-colors ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/40">
      <Icon className={cn("size-[18px] shrink-0", iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold tabular-nums">{t`Pages ${part.range.startPage}–${part.range.endPage}`}</div>
      </div>
      <StatusBadge status={part.status} />
      <div className="flex min-w-[210px] shrink-0 items-center justify-end gap-2">
        {part.status === "merged" ? (
          <Button size="sm" variant="outline" onClick={onView}><BookOpen className="size-3.5" /> <Trans>View in book</Trans></Button>
        ) : (
          <ImportPartButton />
        )}
      </div>
    </div>
  )
}

function MergeFooter({ merged, total, assembled, onManage }: { merged: number; total: number; assembled: boolean; onManage: () => void }) {
  return (
    <div className={cn("flex items-center gap-3.5 border-t px-5 py-4", assembled ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-brand-50 dark:bg-brand-950/20")}>
      <FolderDown className={cn("size-5 shrink-0", assembled ? "text-emerald-700 dark:text-emerald-400" : "text-brand-700")} />
      <div className="min-w-0 flex-1">
        {assembled ? (
          <div className="text-[13.5px] font-semibold text-emerald-800 dark:text-emerald-300"><Trans>All parts merged — book assembled</Trans></div>
        ) : (
          <>
            <div className="text-[13.5px] font-semibold text-brand-800 dark:text-brand-200"><Trans>{merged} of {total} parts merged back</Trans></div>
            <div className="text-[12.5px] text-brand-700/80 dark:text-brand-300/80"><Trans>Process parts here or import ones you shared — then merge them into the source book.</Trans></div>
          </>
        )}
      </div>
      {assembled ? (
        <Button size="sm" variant="outline" onClick={onManage}><BookOpen className="size-3.5" /> <Trans>Manage in book</Trans></Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link to="/books/import"><FolderDown className="size-3.5" /> <Trans>Import a part .zip</Trans></Link>
        </Button>
      )}
    </div>
  )
}
