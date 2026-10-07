import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, CheckCircle2, FileText, Image as ImageIcon, MapPin, MapPinOff, MessageSquareReply, RotateCcw, Undo2 } from "lucide-react"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { Button } from "@/components/ui/button"
import { formatPublishDateTime } from "../expiry-options"
import { STAGES } from "@/components/pipeline/stage-config"
import { cn } from "@/lib/utils"
import type { DashThread } from "./dashboard-data"
import type { CommentLocation } from "./FeedbackPage"
import { initialOf, threadDestination } from "./helpers"

/** The Storyboard's own accent, so the way into it looks like the stage it opens. */
const STORYBOARD = STAGES.find((stage) => stage.slug === "storyboard")!

/** The comment under the page: who said it, what, and the conversation since. */
export function FeedbackComment({
  thread,
  held,
  liveVersion,
  location,
}: {
  thread: DashThread
  held: boolean
  liveVersion: number | null
  /** What the pin is on, once the page has resolved it. */
  location?: CommentLocation
}) {
  const { i18n } = useLingui()
  const stale = thread.version !== null && liveVersion !== null && thread.version < liveVersion
  const pageLabel = thread.pageLabel
  const version = thread.version

  return (
    <article key={thread.id} className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          style={{ backgroundColor: thread.authorColor }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full rounded-bl-none text-xs font-bold text-white"
        >
          {initialOf(thread.authorName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{thread.authorName}</span>
            <span className="shrink-0 text-xs text-muted-foreground" title={formatPublishDateTime(thread.createdAt, i18n.locale)}>
              <RelativeTime iso={thread.createdAt} />
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {stale ? <Trans>{pageLabel} · left on version {version}</Trans> : pageLabel}
          </span>
        </div>
        <Status thread={thread} held={held} />
      </header>

      <Location location={location} stale={stale} version={thread.version} />

      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{thread.body}</p>

      {thread.replies.length > 0 ? (
        <ol className="flex list-none flex-col gap-2.5 border-l-2 border-muted pl-4">
          {thread.replies.map((reply) => (
            <li key={reply.id} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                style={{ backgroundColor: reply.authorColor }}
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              >
                {initialOf(reply.authorName)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{reply.authorName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    <RelativeTime iso={reply.createdAt} />
                  </span>
                </span>
                <span className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{reply.body}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans>No replies yet.</Trans>
        </p>
      )}
    </article>
  )
}

/** What the author does with the thread: answer it where the page is, or settle it. */
export function FeedbackActions({
  bookLabel,
  thread,
  held,
  resolveFailed = false,
  onResolve,
  onUndo,
  onReopen,
  onNext,
}: {
  bookLabel: string
  thread: DashThread
  held: boolean
  /** The last resolve didn't go through; the thread is back to waiting. */
  resolveFailed?: boolean
  onResolve: () => void
  onUndo: () => void
  onReopen: () => void
  onNext: (() => void) | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
      {onNext ? (
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={onNext}>
          <Trans>Next waiting</Trans>
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}

      <span className="ml-auto flex items-center gap-2">
        {resolveFailed && !held && !thread.resolved ? (
          <span role="alert" className="text-xs text-amber-700 dark:text-amber-300">
            <Trans>That didn't resolve. Try again.</Trans>
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className={cn(
            STORYBOARD.bgLight,
            STORYBOARD.borderColor,
            STORYBOARD.textColor,
            "hover:border-violet-300 hover:bg-violet-100 hover:text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/20 dark:hover:text-violet-100",
          )}
          asChild
        >
          <Link {...threadDestination(bookLabel, thread)}>
            <MessageSquareReply aria-hidden="true" />
            {thread.quiz ? <Trans>Fix in Quizzes</Trans> : <Trans>Fix in Storyboard</Trans>}
          </Link>
        </Button>

        {held ? (
          <span className="flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 pl-2.5 text-sm font-medium text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Check className="size-4" aria-hidden="true" />
            <span role="status">
              <Trans>Resolved</Trans>
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-100" onClick={onUndo}>
              <Undo2 aria-hidden="true" />
              <Trans>Undo</Trans>
            </Button>
          </span>
        ) : thread.resolved ? (
          <Button
            size="sm"
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
            onClick={onReopen}
          >
            <RotateCcw aria-hidden="true" />
            <Trans>Reopen</Trans>
          </Button>
        ) : (
          <Button size="sm" className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" onClick={onResolve}>
            <Check aria-hidden="true" />
            <Trans>Resolve</Trans>
          </Button>
        )}
      </span>
    </div>
  )
}

/**
 * What the comment is on, in the reader's own words for it: the text it was pinned to, quoted, or
 * the picture's description. When the pin's element has gone, it says so plainly instead.
 */
function Location({ location, stale, version }: { location?: CommentLocation; stale: boolean; version: number | null }) {
  if (location?.kind === "unavailable") return null
  if (!location || location.kind === "loading") {
    return <span aria-hidden="true" className="h-9 rounded-lg bg-muted/50 motion-safe:animate-pulse" />
  }
  if (location.kind === "page") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <Trans>On the page as a whole</Trans>
      </p>
    )
  }
  if (location.kind === "moved") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 motion-safe:animate-in motion-safe:fade-in-0 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {stale && version !== null ? (
          <Trans>This spot has moved since version {version}. Open the page in the Storyboard to find what it was on.</Trans>
        ) : (
          <Trans>What this comment was on isn't on the page any more. Open it in the Storyboard to see where it was.</Trans>
        )}
      </p>
    )
  }
  return (
    <p className="flex items-start gap-2 border-l-2 border-brand-400 pl-3 text-[13px] leading-snug text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0">
      {location.picture ? (
        <ImageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="line-clamp-2 min-w-0">
        {location.picture ? (
          location.quote ? (
            <Trans>
              On the picture: <span className="text-foreground/85">{location.quote}</span>
            </Trans>
          ) : (
            <Trans>On a picture</Trans>
          )
        ) : location.quote ? (
          <Trans>
            On “<span className="text-foreground/85">{location.quote}</span>”
          </Trans>
        ) : (
          <Trans>On the marked spot</Trans>
        )}
      </span>
    </p>
  )
}

function Status({ thread, held }: { thread: DashThread; held: boolean }) {
  if (thread.resolved || held) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        <Trans>Resolved</Trans>
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      <Trans>Waiting on you</Trans>
    </span>
  )
}
