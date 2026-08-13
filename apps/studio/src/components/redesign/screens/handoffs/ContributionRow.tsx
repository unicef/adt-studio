import { useNavigate } from "@tanstack/react-router"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Puzzle, BookOpen, FolderUp, Pencil, CircleDashed } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "@/components/redesign/shared/BookCover"
import { toBookVM } from "@/components/redesign/shared/data"

export interface ContributionRowProps {
  book: BookSummary
  locale: string
}

/** A part someone shared with you (derived from real `book.part`). */
export function ContributionRow({ book, locale }: ContributionRowProps) {
  const navigate = useNavigate()
  const { t } = useLingui()
  const vm = toBookVM(book, locale)
  const part = book.part!
  const range = t`pg ${part.range.startPage}–${part.range.endPage}`
  const inProgress = vm.hasStages

  return (
    <div className="mb-3 flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm">
      <div className="h-[55px] w-[42px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
        <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-[15px] font-semibold">{vm.displayTitle}</span>
          <Badge variant="secondary" className="shrink-0 gap-1.5 px-2 text-[10.5px]">
            <Puzzle className="size-3" />
            {range}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          <Trans>Part of {part.sourceLabel}</Trans>
        </div>
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        <Plural value={vm.stageCount} one="# stage" other="# stages" />
      </span>
      <Badge variant={inProgress ? "warning" : "secondary"} className="min-w-[112px] justify-center gap-1 px-2 text-[10.5px]">
        {inProgress ? <Pencil className="size-3" /> : <CircleDashed className="size-3" />}
        {inProgress ? <Trans>In progress</Trans> : <Trans>Not started</Trans>}
      </Badge>
      <Button variant="outline" size="sm" onClick={() => navigate({ to: "/books/$label/$step", params: { label: book.label, step: "book" } })}>
        <BookOpen className="size-3.5" />
        <Trans>Open part</Trans>
      </Button>
      <Button size="sm" onClick={() => navigate({ to: "/books/$label/$step", params: { label: book.label, step: "export" } })}>
        <FolderUp className="size-3.5" />
        <Trans>Export & return .zip</Trans>
      </Button>
    </div>
  )
}
