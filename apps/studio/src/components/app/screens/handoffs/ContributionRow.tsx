import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Scissors, BookOpen, FolderUp } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "../../BookCover"
import { toBookVM } from "../../data"
import { useOpenBook } from "../../use-open-book"
import { StatusBadge } from "./status"

export interface ContributionRowProps {
  book: BookSummary
  locale: string
}

export function ContributionRow({ book, locale }: ContributionRowProps) {
  const openBook = useOpenBook()
  const { t } = useLingui()
  const vm = toBookVM(book, locale)
  const part = book.part!
  const range = t`pg ${part.range.startPage}–${part.range.endPage}`
  const status = vm.hasStages ? "in-progress" : "not-started"

  return (
    <div className="mb-3 flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm transition-colors ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/30">
      <div className="h-[55px] w-[42px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
        <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-[15px] font-semibold">{vm.displayTitle}</span>
          <Badge variant="secondary" className="shrink-0 gap-1.5 px-2 text-[10.5px]">
            <Scissors className="size-3" />
            {range}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          <Trans>Part of {part.sourceLabel}</Trans>
        </div>
      </div>
      <StatusBadge status={status} />
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openBook(book.label)}>
          <BookOpen className="size-3.5" />
          <Trans>Open part</Trans>
        </Button>
        <Button asChild size="sm">
          <Link to="/books/$label/$step" params={{ label: book.label, step: "export" }}>
            <FolderUp className="size-3.5" />
            <Trans>Export &amp; return .zip</Trans>
          </Link>
        </Button>
      </div>
    </div>
  )
}
