import { Fragment, type ReactNode } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useNavigate } from "@tanstack/react-router"
import { X, TriangleAlert, ArrowRight, Trash2, MessageSquare, Send, Eye, FolderUp, HardDrive, Split, DownloadCloud, Globe, Copy } from "lucide-react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BookCover } from "../../BookCover"
import { formatRelative, type BookVM } from "../../data"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { progressFor } from "../home/home-full/kit"
import { CommentsBannerAvatars, type ReviewComment } from "./CommentsBanner"

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

const PRESS = "transition-transform active:scale-[0.98]"
export function BookDetailDialog({ book, onOpenChange, onEdit, onDelete, onPublish }: BookDetailDialogProps) {
  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 flex max-h-[88vh] min-h-[440px] w-full max-w-[780px] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
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
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const goStep = (step: "preview" | "export") => navigate({ to: "/books/$label/$step", params: { label: book.label, step } })

  const p = progressFor(book)
  const comments = book.comments ?? []
  const commentCount = comments.length || (book.pendingComments ?? 0)
  const hasError = book.needsRebuild || !!book.hasError

  return (
    <>
      <div className="relative z-10 h-[212px] shrink-0 overflow-hidden shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)]">
        {book.cover.src ? (
          <img src={book.cover.src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl brightness-[0.72]" />
        ) : (
          <div aria-hidden className="absolute inset-0" style={{ background: book.cover.bg }} />
        )}
        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.14) 0%, rgba(0,0,0,.34) 48%, rgba(0,0,0,.74) 100%)" }} />

        <DialogPrimitive.Close asChild>
          <button type="button" className={cn("absolute right-3.5 top-3.5 z-20 grid size-8 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25", PRESS)}>
            <X className="size-4" />
            <span className="sr-only">
              <Trans>Close</Trans>
            </span>
          </button>
        </DialogPrimitive.Close>

        <div className="relative flex h-full items-end gap-4 p-6 text-white">
          <div className="h-[150px] w-[106px] shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/25">
            <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} fit="cover" />
          </div>
          <div className="min-w-0 flex-1 pb-1 pr-8">
            <DialogPrimitive.Title asChild>
              <h2 className="text-[23px] font-bold leading-tight tracking-[-0.02em] [text-shadow:0_1px_12px_rgba(0,0,0,.4)]">{book.displayTitle}</h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <p className="mt-0.5 text-[13px] text-white/75">{book.authors}</p>
            </DialogPrimitive.Description>
            <MetaLine book={book} locale={i18n.locale} light />
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-4 px-7 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Trans>Base</Trans>
          </span>
          <BaseStages book={book} />
        </div>
        <div className="flex items-center gap-2.5">
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background px-7 pb-7 pt-4">
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

        <OriginBadges book={book} />

        {book.publication && <PublishedCard publication={book.publication} copyLabel={t`Copy link`} />}

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
                    {getStageLabelI18n(stage.slug)}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
          <HardDrive className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            <Trans>Stored locally on this computer</Trans>
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

function languageName(code: string | null | undefined, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function MetaLine({ book, locale, light }: { book: DetailBook; locale: string; light?: boolean }) {
  const parts: ReactNode[] = []
  const lang = languageName(book.raw.languageCode, locale)
  if (lang) parts.push(lang)
  if (book.raw.publisher) parts.push(book.raw.publisher)
  if (book.raw.createdAt) parts.push(<Trans>Added {formatRelative(book.raw.createdAt, locale)}</Trans>)
  parts.push(<Trans>Edited {book.modified}</Trans>)
  return (
    <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px]", light ? "text-white/70" : "text-muted-foreground")}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={light ? "text-white/35" : "text-muted-foreground/40"}>·</span>}
          <span>{part}</span>
        </Fragment>
      ))}
    </div>
  )
}

function BaseStages({ book }: { book: DetailBook }) {
  const p = progressFor(book)
  return (
    <div className="flex items-center gap-1.5">
      {p.baseSteps.map(({ stage, done }) => {
        const Icon = stage.icon
        return (
          <span
            key={stage.slug}
            title={getStageLabelI18n(stage.slug)}
            className={cn("grid size-6 place-items-center rounded-full", !done && "bg-muted text-muted-foreground/40")}
            style={done ? { background: `${stage.hex}1a`, color: stage.hex } : undefined}
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
        )
      })}
    </div>
  )
}

function OriginBadges({ book }: { book: DetailBook }) {
  const part = book.raw.part
  if (!part && !book.imported) return null
  const badge = "inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-[12px] font-medium"
  return (
    <div className="flex flex-wrap gap-2">
      {part && (
        <span className={badge}>
          <Split className="size-3.5 text-muted-foreground" />
          <Trans>Split part · pages {part.range.startPage}–{part.range.endPage}</Trans>
        </span>
      )}
      {book.imported && (
        <span className={badge}>
          <DownloadCloud className="size-3.5 text-muted-foreground" />
          <Trans>Imported ADT</Trans>
        </span>
      )}
    </div>
  )
}

function PubState({ state }: { state?: BookPublication["state"] }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
  if (state === "expired")
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Trans>Expired</Trans>
      </span>
    )
  if (state === "revoked")
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        <Trans>Revoked</Trans>
      </span>
    )
  return (
    <span className={cn(base, "bg-emerald-500/12 text-emerald-600")}>
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <Trans>Active</Trans>
    </span>
  )
}

function PublishedCard({ publication, copyLabel }: { publication: BookPublication; copyLabel: string }) {
  const copy = () => navigator.clipboard?.writeText(publication.url)
  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700">
          <Globe className="size-3.5" />
          <Trans>Published for review</Trans>
        </div>
        <PubState state={publication.state} />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <a href={publication.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-lg border bg-card px-3 py-2 font-mono text-[12.5px] transition-colors hover:border-brand-300">
          {publication.url}
        </a>
        <Button size="sm" variant="outline" aria-label={copyLabel} className={cn(PRESS, "shrink-0")} onClick={copy}>
          <Copy className="size-3.5" />
          <Trans>Copy</Trans>
        </Button>
      </div>
      {publication.accessCode && (
        <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span>
            <Trans>Access code</Trans>
          </span>
          <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-[13px] font-bold tracking-[0.25em] text-foreground">{publication.accessCode}</span>
        </div>
      )}
    </div>
  )
}

function IconBtn({ onClick, danger, label, children }: { onClick: () => void; danger?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted", danger && "hover:bg-destructive/10 hover:text-destructive", PRESS)}
    >
      {children}
    </button>
  )
}
