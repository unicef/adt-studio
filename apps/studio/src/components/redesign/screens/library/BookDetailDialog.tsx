import type { ReactNode } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useNavigate } from "@tanstack/react-router"
import { X, TriangleAlert, ArrowRight, Trash2, MessageSquare, Send, Eye, Sparkles, FileText, FolderUp, HardDrive } from "lucide-react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BookCover } from "../../BookCover"
import type { BookVM } from "../../data"
import { progressFor } from "../home/home-full/kit"
import { CommentsBannerAvatars, type ReviewComment } from "./CommentsBanner"

export type DetailBook = BookVM & { hasError?: boolean; pendingComments?: number; comments?: ReviewComment[] }

export interface BookDetailDialogProps {
  book: DetailBook | null
  onOpenChange: (open: boolean) => void
  onEdit: (label: string) => void
  onDelete: (label: string) => void
  onPublish?: (label: string) => void
}

const PRESS = "transition-transform active:scale-[0.98]"
const CONTENT =
  // eslint-disable-next-line lingui/no-unlocalized-strings -- tailwind class list
  "fixed left-[50%] top-[50%] z-50 flex min-h-[500px] w-full max-w-[780px] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"

export function BookDetailDialog({ book, onOpenChange, onEdit, onDelete, onPublish }: BookDetailDialogProps) {
  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className={CONTENT}>
          {book && <BookDetail book={book} onEdit={onEdit} onDelete={onDelete} onPublish={onPublish} />}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

function BookDetail({
  book,
  onEdit,
  onDelete,
  onPublish,
}: {
  book: DetailBook
  onEdit: (label: string) => void
  onDelete: (label: string) => void
  onPublish?: (label: string) => void
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const goStep = (step: "preview" | "export") => navigate({ to: "/books/$label/$step", params: { label: book.label, step } })

  const p = progressFor(book)
  const baseDone = p.baseSteps.filter((s) => s.done).length
  const comments = book.comments ?? []
  const commentCount = comments.length || (book.pendingComments ?? 0)
  const hasError = book.needsRebuild || !!book.hasError

  return (
    <>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          {book.cover.src ? (
            <img src={book.cover.src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-105 object-cover blur-lg brightness-[0.62]" />
          ) : (
            <div aria-hidden className="absolute inset-0" style={{ background: book.cover.bg }} />
          )}
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.38), rgba(0,0,0,.74))" }} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-20" style={{ background: "linear-gradient(180deg, transparent, var(--background))" }} />
        </div>

        <DialogPrimitive.Close asChild>
          <button
            type="button"
            className={cn("absolute right-3.5 top-3.5 z-20 grid size-8 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25", PRESS)}
          >
            <X className="size-4" />
            <span className="sr-only">
              <Trans>Close</Trans>
            </span>
          </button>
        </DialogPrimitive.Close>

        <div className="relative flex gap-7 p-8">
          <div className="h-[272px] w-[194px] shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/25">
            <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} fit="cover" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col text-white">
            <DialogPrimitive.Title asChild>
              <h2 className="pr-8 text-[24px] font-bold leading-tight tracking-[-0.02em] [text-shadow:0_1px_14px_rgba(0,0,0,.5)]">{book.displayTitle}</h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <p className="mt-1 text-[13px] text-white/70">{book.authors}</p>
            </DialogPrimitive.Description>

            <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg backdrop-blur-md">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-semibold">
                  <StatusText status={p.status} />
                </span>
                <span className="text-[11.5px] text-white/60">
                  <Trans>{baseDone} of 3 base steps</Trans>
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {p.baseSteps.map(({ stage, done }) => (
                  <span key={stage.slug} className={cn("h-1.5 flex-1 rounded-full", !done && "bg-white/25")} style={done ? { background: stage.hex } : undefined} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                <GlassStat icon={Sparkles} label={<Trans>Outputs</Trans>} value={p.optionalDone.length} />
                <GlassStat icon={MessageSquare} label={<Trans>Comments</Trans>} value={commentCount} />
                <GlassStat icon={FileText} label={<Trans>Pages</Trans>} value={book.raw.pageCount} />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <Button className={cn(PRESS, "flex-1 bg-brand-600 text-white hover:bg-brand-700")} onClick={() => onEdit(book.label)}>
                <ArrowRight className="size-3.5" />
                {p.status === "new" ? <Trans>Start</Trans> : <Trans>Continue</Trans>}
              </Button>
              {p.baseComplete && (
                <IconBtn onClick={() => goStep("preview")} label={t`Preview`}>
                  <Eye className="size-4" />
                </IconBtn>
              )}
              {p.baseComplete && onPublish && (
                <IconBtn onClick={() => onPublish(book.label)} label={t`Publish for review`}>
                  <Send className="size-4" />
                </IconBtn>
              )}
              <IconBtn onClick={() => onDelete(book.label)} danger label={t`Delete`}>
                <Trash2 className="size-4" />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 bg-background px-7 pb-7 pt-3">
        {hasError ? (
          <div className="flex items-center gap-3 rounded-xl border border-stage-toc/30 bg-stage-toc/10 px-3.5 py-3 text-[13px]">
            <TriangleAlert className="size-4 shrink-0 text-stage-toc" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-stage-toc">
                <Trans>Needs fixing</Trans>
              </div>
              {book.raw.rebuildReason && <div className="truncate text-muted-foreground">{book.raw.rebuildReason}</div>}
            </div>
            <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => onEdit(book.label)}>
              <Trans>Fix</Trans>
            </Button>
          </div>
        ) : comments.length > 0 ? (
          <CommentsBannerAvatars comments={comments} onReview={() => goStep("preview")} />
        ) : commentCount > 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3.5 py-3 text-[13px]">
            <MessageSquare className="size-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1 font-medium">
              <Plural value={commentCount} one="# comment to review" other="# comments to review" />
            </div>
            <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => goStep("preview")}>
              <Trans>Review</Trans>
            </Button>
          </div>
        ) : null}

        {p.optionalDone.length > 0 && (
          <div>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Trans>What&apos;s inside</Trans>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.optionalDone.map(({ stage }) => {
                const Icon = stage.icon
                return (
                  <span key={stage.slug} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[12px] font-medium">
                    <Icon className="size-3.5" style={{ color: stage.hex }} />
                    {stage.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
          <HardDrive className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            <span className="font-medium text-foreground">{projectSize(book)}</span> <Trans>· stored locally on this computer</Trans>
          </div>
          <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => goStep("export")}>
            <FolderUp className="size-3.5" />
            <Trans>Export .zip</Trans>
          </Button>
        </div>
      </div>
    </>
  )
}

function StatusText({ status }: { status: ReturnType<typeof progressFor>["status"] }) {
  if (status === "new") return <Trans>Not started</Trans>
  if (status === "rebuild") return <Trans>Needs rebuild</Trans>
  if (status === "ready") return <Trans>Ready</Trans>
  return <Trans>In progress</Trans>
}

function GlassStat({ icon: Icon, label, value }: { icon: typeof Sparkles; label: ReactNode; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-white/55">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-0.5 text-[19px] font-bold tabular-nums text-white">{value}</div>
    </div>
  )
}

function IconBtn({ onClick, danger, label, children }: { onClick: () => void; danger?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20",
        danger && "hover:border-red-400/40 hover:bg-red-500/30",
        PRESS,
      )}
    >
      {children}
    </button>
  )
}

function projectSize(book: DetailBook): string {
  const p = progressFor(book)
  const mb = Math.round(book.raw.pageCount * 0.4 + p.optionalDone.length * 12 + 8)
  /* eslint-disable-next-line lingui/no-unlocalized-strings -- file size units */
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}
