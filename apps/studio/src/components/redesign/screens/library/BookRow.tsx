import { Pencil, Trash2, TriangleAlert } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "../../BookCover"
import { StagePill } from "../../ui/StagePill"
import type { BookVM } from "../../data"

const PILL = "gap-1 px-2 text-[10.5px]"

export interface BookRowProps {
  book: BookVM
  onOpenDetail: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BookRow({ book, onOpenDetail, onEdit, onDelete }: BookRowProps) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-px hover:border-brand-300 hover:shadow-md">
      <button type="button" onClick={onOpenDetail} className="my-[13px] ml-[15px] h-16 w-12 shrink-0 overflow-hidden rounded-md shadow-sm">
        <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-[18px] py-[13px]">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
            <h3 className="truncate text-base font-semibold tracking-[-0.01em]">{book.displayTitle}</h3>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {book.authors} · {book.pagesText} · {book.modified}
            </div>
          </button>
          <div className="flex shrink-0 gap-1.5">
            {book.needsRebuild && (
              <Badge variant="destructive" className={PILL}>
                <TriangleAlert className="size-3" />
                <Trans>Needs rebuild</Trans>
              </Badge>
            )}
            {book.isNew && (
              <Badge variant="secondary" className={PILL}>
                <Trans>New</Trans>
              </Badge>
            )}
            <Badge variant="outline" className={PILL}>
              {book.lang}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {book.hasStages ? (
            <StagePill discs={book.discs} className="ml-auto" />
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">
              <Trans>Not started — add a PDF to begin</Trans>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col border-l">
        <button
          type="button"
          onClick={onEdit}
          className="grid w-11 flex-1 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid w-11 flex-1 place-items-center border-t text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
