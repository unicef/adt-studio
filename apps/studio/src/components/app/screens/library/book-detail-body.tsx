import { Fragment, type ReactNode } from "react"
import { TriangleAlert, ArrowRight, Trash2, MessageSquare, Send, Eye, FolderUp, HardDrive, Split, DownloadCloud, Globe, Copy, Link2Off, CalendarOff } from "lucide-react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { formatRelative } from "../../data"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { progressFor } from "../shared/kit"
import { CommentsBannerAvatars } from "./CommentsBanner"
import type { DetailBook } from "./BookDetailDialog"

export const PRESS = "transition-transform active:scale-[0.98]"

export interface DetailHandlers {
  onEdit: (label: string) => void
  onDelete: (label: string) => void
  onPublish?: (label: string) => void
  goStep: (step: "preview" | "export" | "storyboard" | "publish") => void
}

function languageName(code: string | null | undefined, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function MetaLine({ book, locale, light }: { book: DetailBook; locale: string; light?: boolean }) {
  const parts: ReactNode[] = []
  const lang = languageName(book.raw.languageCode, locale)
  if (lang) parts.push(lang)
  if (book.raw.publisher) parts.push(book.raw.publisher)
  if (book.raw.createdAt) parts.push(<Trans>Added {formatRelative(book.raw.createdAt, locale)}</Trans>)
  parts.push(<Trans>Edited {book.modified}</Trans>)
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 text-[12.5px]", light ? "text-white/70" : "text-muted-foreground")}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={light ? "text-white/35" : "text-muted-foreground/40"}>·</span>}
          <span>{part}</span>
        </Fragment>
      ))}
    </div>
  )
}

export function BaseStages({ book }: { book: DetailBook }) {
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

export function DetailActions({ book, handlers }: { book: DetailBook; handlers: DetailHandlers }) {
  const { t } = useLingui()
  const p = progressFor(book)
  return (
    <div className="flex items-center gap-2.5">
      <Button className={cn(PRESS, "flex-1 bg-brand-600 text-primary-foreground hover:bg-brand-700")} onClick={() => handlers.onEdit(book.label)}>
        <ArrowRight className="size-3.5" />
        {p.status === "new" ? <Trans>Start</Trans> : <Trans>Continue</Trans>}
      </Button>
      {p.baseComplete && (
        <IconBtn onClick={() => handlers.goStep("preview")} label={t`Preview`}>
          <Eye className="size-4" />
        </IconBtn>
      )}
      {p.baseComplete && handlers.onPublish && (
        <IconBtn onClick={() => handlers.onPublish!(book.label)} label={t`Share for review`}>
          <Send className="size-4" />
        </IconBtn>
      )}
      <IconBtn onClick={() => handlers.onDelete(book.label)} danger label={t`Delete`}>
        <Trash2 className="size-4" />
      </IconBtn>
    </div>
  )
}

export function DetailInfo({ book, handlers }: { book: DetailBook; handlers: DetailHandlers }) {
  const { t } = useLingui()
  const p = progressFor(book)
  const comments = book.comments ?? []
  const commentCount = comments.length || (book.pendingComments ?? 0)
  const hasError = book.needsRebuild || !!book.hasError
  return (
    <div className="space-y-4">
      {hasError ? (
        <div className="flex items-center gap-3 rounded-xl border border-stage-toc/30 bg-stage-toc/10 px-3.5 py-3 text-[13px]">
          <TriangleAlert className="size-4 shrink-0 text-stage-toc" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-stage-toc">
              <Trans>Needs fixing</Trans>
            </div>
            {book.raw.rebuildReason && <div className="truncate text-muted-foreground">{book.raw.rebuildReason}</div>}
          </div>
          <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => handlers.onEdit(book.label)}>
            <Trans>Fix</Trans>
          </Button>
        </div>
      ) : null}

      {/* Readers' comments are read where they were left — pinned to the storyboard — and they
          are waiting whether or not the book also needs fixing. */}
      {comments.length > 0 ? (
        <CommentsBannerAvatars comments={comments} onReview={() => handlers.goStep("storyboard")} />
      ) : commentCount > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3.5 py-3 text-[13px]">
          <MessageSquare className="size-4 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1 font-medium">
            <Plural value={commentCount} one="# comment to review" other="# comments to review" />
          </div>
          <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => handlers.goStep("storyboard")}>
            <Trans>Review</Trans>
          </Button>
        </div>
      ) : null}

      <OriginBadges book={book} />

      {book.publication && (
        <PublishedCard
          publication={book.publication}
          copyLabel={t`Copy link`}
          onOpenSharing={() => handlers.goStep("publish")}
        />
      )}

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
        <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={() => handlers.goStep("export")}>
          <FolderUp className="size-3.5" />
          <Trans>Export .zip</Trans>
        </Button>
      </div>
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

/**
 * The book's shared copy, as it stands.
 *
 * Live is the only state with a link worth copying. A stopped or expired link still *exists* —
 * readers may have it in a message — but it no longer opens, so it is shown as a dead address
 * with no Copy, and the way forward is the Sharing page: resume the same link, or share again.
 */
function PublishedCard({
  publication,
  copyLabel,
  onOpenSharing,
}: {
  publication: NonNullable<DetailBook["publication"]>
  copyLabel: string
  onOpenSharing: () => void
}) {
  const { t } = useLingui()
  const live = publication.state !== "expired" && publication.state !== "revoked"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publication.url)
      toast.success(t`Link copied to the clipboard`)
    } catch {
      toast.error(t`Couldn't copy the link — open the book's Sharing step and copy it there.`)
    }
  }

  if (!live) {
    const stopped = publication.state === "revoked"
    const Icon = stopped ? Link2Off : CalendarOff
    return (
      <div className="rounded-xl border bg-muted/40 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
            <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            {stopped ? <Trans>Sharing stopped</Trans> : <Trans>Link expired</Trans>}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
            {stopped ? <Trans>Stopped</Trans> : <Trans>Expired</Trans>}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
          {stopped ? (
            <Trans>The link doesn't open right now. Resuming turns the same link back on, with every comment kept.</Trans>
          ) : (
            <Trans>The link no longer opens. Sharing again makes a new one.</Trans>
          )}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg border border-dashed px-3 py-2 font-mono text-[12.5px] text-muted-foreground/70 line-through decoration-muted-foreground/40">
            {publication.url}
          </span>
          <Button size="sm" variant="outline" className={cn(PRESS, "shrink-0")} onClick={onOpenSharing}>
            <Globe className="size-3.5" aria-hidden />
            <Trans>Open Sharing</Trans>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
          <Globe className="size-3.5" aria-hidden />
          <Trans>Shared for review</Trans>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            <Trans>Live</Trans>
          </span>
          <button
            type="button"
            onClick={onOpenSharing}
            className={cn(
              PRESS,
              "rounded-md px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
            )}
          >
            <Trans>Manage</Trans>
          </button>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <a href={publication.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-lg border bg-card px-3 py-2 font-mono text-[12.5px] transition-colors hover:border-brand-300">
          {publication.url}
        </a>
        <Button size="sm" variant="outline" aria-label={copyLabel} className={cn(PRESS, "shrink-0")} onClick={() => void copy()}>
          <Copy className="size-3.5" aria-hidden />
          <Trans>Copy</Trans>
        </Button>
      </div>
      {publication.accessCode && (
        <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span><Trans>Access code</Trans></span>
          <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-[13px] font-bold tracking-[0.25em] text-foreground">{publication.accessCode}</span>
        </div>
      )}
    </div>
  )
}

export function IconBtn({ onClick, danger, label, children }: { onClick: () => void; danger?: boolean; label: string; children: ReactNode }) {
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
