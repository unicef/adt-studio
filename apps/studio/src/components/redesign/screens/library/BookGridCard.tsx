import { TriangleAlert } from "lucide-react"
import { Trans, Plural } from "@lingui/react/macro"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "../../BookCover"
import type { BookVM } from "../../data"

export interface BookGridCardProps {
  book: BookVM
  onOpenDetail: () => void
}

export function BookGridCard({ book, onOpenDetail }: BookGridCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="relative grid h-[150px] place-items-center border-b bg-muted">
        <span className="absolute right-2.5 top-2.5 z-[2] rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#1a1a1a]">
          {book.lang}
        </span>
        {book.needsRebuild && (
          <Badge variant="destructive" className="absolute left-2 top-2 z-[2] gap-1 px-2 text-[10.5px] shadow-sm">
            <TriangleAlert className="size-3" />
            <Trans>Rebuild</Trans>
          </Badge>
        )}
        <div className="h-32 w-24 overflow-hidden rounded-md shadow-md">
          <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
        <h3 className="line-clamp-1 text-sm font-semibold tracking-[-0.01em]">{book.displayTitle}</h3>
        <div className="truncate text-xs text-muted-foreground">
          {book.authors} · {book.pagesText}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          {book.hasStages && (
            <span className="ml-auto text-[11px] font-medium text-muted-foreground">
              <Plural value={book.stageCount} one="# stage" other="# stages" />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
