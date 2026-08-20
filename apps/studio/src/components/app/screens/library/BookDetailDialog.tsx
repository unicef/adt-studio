import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useNavigate } from "@tanstack/react-router"
import { X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { BookCover } from "../../BookCover"
import type { BookVM } from "../../data"
import type { ReviewComment } from "./CommentsBanner"
import { BaseStages, DetailActions, DetailInfo, MetaLine, PRESS, type DetailHandlers } from "./book-detail-body"

export interface BookPublication {
  url: string
  accessCode?: string | null
  state?: "active" | "expired" | "revoked"
}

export type DetailBook = BookVM & {
  hasError?: boolean
  pendingComments?: number
  comments?: ReviewComment[]
  imported?: boolean
  publication?: BookPublication | null
}

export interface BookDetailDialogProps {
  book: DetailBook | null
  onOpenChange: (open: boolean) => void
  onEdit: (label: string) => void
  onDelete: (label: string) => void
  onPublish?: (label: string) => void
}

export function BookDetailDialog({ book, onOpenChange, onEdit, onDelete, onPublish }: BookDetailDialogProps) {
  const navigate = useNavigate()
  const handlers: DetailHandlers = {
    onEdit,
    onDelete,
    onPublish,
    goStep: (step) => book && navigate({ to: "/books/$label/$step", params: { label: book.label, step } }),
  }

  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {book && (
            <>
              <DialogPrimitive.Title className="sr-only">{book.displayTitle}</DialogPrimitive.Title>
              <BookDetail book={book} handlers={handlers} onClose={() => onOpenChange(false)} />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

function BookDetail({ book, handlers, onClose }: { book: DetailBook; handlers: DetailHandlers; onClose: () => void }) {
  const { i18n } = useLingui()
  return (
    <div className="flex max-h-[90vh] w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-2xl">
      <div className="relative h-[292px] shrink-0 overflow-hidden">
        {book.cover.src ? (
          <img src={book.cover.src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-[0.72]" />
        ) : (
          <div aria-hidden className="absolute inset-0" style={{ background: book.cover.bg }} />
        )}
        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.32) 46%, rgba(0,0,0,.72) 100%)" }} />

        <button
          type="button"
          onClick={onClose}
          className={cn("absolute right-3.5 top-3.5 z-30 grid size-8 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25", PRESS)}
        >
          <X className="size-4" />
          <span className="sr-only"><Trans>Close</Trans></span>
        </button>

        <div className="relative flex h-full items-end gap-5 p-7 text-white">
          <div className="h-[214px] w-[150px] shrink-0 overflow-hidden rounded-xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/25">
            <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} fit="cover" />
          </div>
          <div className="min-w-0 flex-1 pb-2">
            <h2 className="text-[30px] font-bold leading-[1.05] tracking-[-0.025em] [text-shadow:0_2px_16px_rgba(0,0,0,.45)]">{book.displayTitle}</h2>
            <p className="mt-1 text-[14px] text-white/80">{book.authors}</p>
            <div className="mt-2"><MetaLine book={book} locale={i18n.locale} light /></div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-3.5 px-7 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Trans>Base</Trans>
          </span>
          <BaseStages book={book} />
        </div>
        <DetailActions book={book} handlers={handlers} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-4">
        <DetailInfo book={book} handlers={handlers} />
      </div>
    </div>
  )
}
