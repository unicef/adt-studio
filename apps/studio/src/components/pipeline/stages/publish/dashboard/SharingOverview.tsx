import { Link } from "@tanstack/react-router"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight, Check, CheckCircle2, History, MessageSquare, Undo2, UserPlus } from "lucide-react"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { cn } from "@/lib/utils"
import { feedbackDestination } from "../feedback-destination"
import type { DashboardData, DashReader, DashThread } from "./dashboard-data"
import { PanelEmpty, DashboardPanel, SkeletonRows } from "./DashboardPanel"
import { initialOf, storyboardDestination } from "./helpers"
import { LinkAccessWidget } from "./LinkAccessWidget"
import { useHeldResolve } from "./use-held-resolve"

/** The overview: what is waiting on the author, who turned up, and a line for the history. */
export function SharingOverview({
  data,
  startedAt,
  onExtend,
}: {
  data: DashboardData
  startedAt: string | null
  onExtend: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <WaitingPanel data={data} />
        <div className="grid min-h-0 grid-rows-2 gap-4 [@media(max-height:820px)]:grid-rows-[minmax(0,1fr)_auto]">
          <JoinedPanel data={data} />
          <LinkAccessWidget link={data.link} startedAt={startedAt} onExtend={onExtend} />
        </div>
      </div>
      <VersionLine data={data} />
    </div>
  )
}

function WaitingPanel({ data }: { data: DashboardData }) {
  const { t } = useLingui()
  const { hold, undo, isHeld, failed } = useHeldResolve(data.resolve)
  const bookLabel = data.link.bookLabel
  const shown = data.threads
  const ready = data.status === "ready"

  return (
    <DashboardPanel
      title={<Trans>Waiting on you</Trans>}
      count={ready ? data.threads.length : undefined}
      tone="attention"
      action={
        ready && data.threads.length > 0 ? (
          <Link
            {...storyboardDestination(bookLabel, data.threads)}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none dark:text-brand-300 dark:hover:bg-brand-500/10"
          >
            <Trans>Open all in Storyboard</Trans>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {data.status === "loading" ? (
        <SkeletonRows rows={3} />
      ) : data.status === "error" ? (
        <PanelEmpty
          tone="attention"
          icon={<AlertTriangle className="size-5" aria-hidden="true" />}
          title={<Trans>Can't reach the feedback</Trans>}
          body={<Trans>The sharing service isn't answering. Comments appear here once it does.</Trans>}
        />
      ) : shown.length === 0 ? (
        <PanelEmpty
          tone="good"
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          title={<Trans>Nothing waiting on you</Trans>}
          body={
            data.readers.length === 0 ? (
              <Trans>When readers leave a comment, it lands here first.</Trans>
            ) : (
              <Trans>No open comments. New ones land here first.</Trans>
            )
          }
        />
      ) : (
        <ul className="flex list-none flex-col divide-y p-0">
          {shown.map((thread) => (
            <WaitingRow
              key={thread.id}
              bookLabel={bookLabel}
              thread={thread}
              held={isHeld(thread.id)}
              failed={failed.has(thread.id)}
              onResolve={() => hold(thread.id)}
              onUndo={() => undo(thread.id)}
              resolveLabel={t`Resolve ${thread.authorName}'s comment`}
            />
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}

function WaitingRow({
  bookLabel,
  thread,
  held,
  failed,
  onResolve,
  onUndo,
  resolveLabel,
}: {
  bookLabel: string
  thread: DashThread
  held: boolean
  /** The last resolve didn't go through, so the button offers it again. */
  failed: boolean
  onResolve: () => void
  onUndo: () => void
  resolveLabel: string
}) {
  return (
    <li
      className={cn(
        "group flex items-start gap-2 pr-3 transition-colors duration-200 motion-reduce:transition-none",
        held ? "bg-emerald-50/70 dark:bg-emerald-500/10" : "hover:bg-muted/40",
      )}
    >
      <Link
        {...feedbackDestination(bookLabel, thread.pageSectionId, thread.id)}
        aria-disabled={held}
        tabIndex={held ? -1 : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 py-2.5 pl-4 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
          held && "pointer-events-none opacity-45",
        )}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: thread.authorColor }}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full rounded-bl-none text-xs font-bold text-white"
        >
          {initialOf(thread.authorName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">{thread.authorName}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{thread.pageLabel}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground/80">
              <RelativeTime iso={thread.lastActivityAt} />
            </span>
            {thread.replyCount > 0 ? (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <MessageSquare className="size-3" aria-hidden="true" />
                <Plural value={thread.replyCount} one="# reply" other="# replies" />
              </span>
            ) : null}
          </span>
          <span className="line-clamp-1 text-[13px] leading-snug text-foreground/85">{thread.body}</span>
        </span>
      </Link>

      {held ? (
        <span className="mt-2.5 flex h-7 shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 dark:text-emerald-300">
          <Check className="size-3.5" aria-hidden="true" />
          <span role="status">
            <Trans>Resolved</Trans>
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="ml-1 flex h-7 items-center gap-1 rounded-md px-2 text-foreground/80 transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            <Trans>Undo</Trans>
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label={resolveLabel}
          onClick={onResolve}
          className={cn(
            "mt-2.5 flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors duration-150 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300",
            failed ? "border-amber-200 text-amber-700 dark:border-amber-500/30 dark:text-amber-300" : "text-muted-foreground",
          )}
        >
          <Check className="size-3.5" aria-hidden="true" />
          {failed ? <Trans>Try again</Trans> : <Trans>Resolve</Trans>}
        </button>
      )}
    </li>
  )
}

function JoinedPanel({ data }: { data: DashboardData }) {
  const { t } = useLingui()
  const recent = [...data.readers]
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
  const ready = data.readersStatus === "ready"
  const commenting = data.readers.filter((reader) => reader.commentCount > 0).length

  return (
    <DashboardPanel
      title={<Trans>Who joined</Trans>}
      count={ready ? data.readers.length : undefined}
      action={
        ready && data.readers.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            <Plural value={commenting} _0="no comments yet" one="# has commented" other="# have commented" />
          </span>
        ) : null
      }
    >
      {data.readersStatus === "loading" ? (
        <SkeletonRows rows={4} />
      ) : data.readersStatus === "error" ? (
        <PanelEmpty
          tone="attention"
          icon={<AlertTriangle className="size-5" aria-hidden="true" />}
          title={<Trans>Can't reach the readers</Trans>}
          body={<Trans>They come back once the service answers.</Trans>}
        />
      ) : recent.length === 0 ? (
        <PanelEmpty
          icon={<UserPlus className="size-5" aria-hidden="true" />}
          title={<Trans>Nobody has joined yet</Trans>}
          body={<Trans>Readers appear here once they open the link and give a name.</Trans>}
        />
      ) : (
        <div role="table" aria-label={t`Who joined`} className="px-1.5 pb-1.5">
          <div
            role="row"
            className={cn(JOINED_COLUMNS, "sticky top-0 z-10 h-8 bg-card px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground")}
          >
            <span role="columnheader" className="col-span-2">
              <Trans>Reader</Trans>
            </span>
            <span role="columnheader" className="text-right">
              <Trans>Joined</Trans>
            </span>
            <span role="columnheader" className="text-right">
              <Trans>Comments</Trans>
            </span>
          </div>
          {recent.map((reader) => (
            <JoinedRow key={reader.id} reader={reader} />
          ))}
        </div>
      )}
    </DashboardPanel>
  )
}

/** Avatar · name · joined · comments — fixed tracks, so every row lines up under its heading
 *  however long a name or a count is. */
const JOINED_COLUMNS = "grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(4.5rem,auto)_4.5rem] items-center gap-x-3"

function JoinedRow({ reader }: { reader: DashReader }) {
  return (
    <div
      role="row"
      className={cn(JOINED_COLUMNS, "h-11 rounded-lg px-2.5 transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none")}
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: reader.color }}
        className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
      >
        {initialOf(reader.name)}
      </span>
      <span role="cell" className="truncate text-[13px] font-medium text-foreground">
        {reader.name}
      </span>
      <span role="cell" className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
        <RelativeTime iso={reader.joinedAt} />
      </span>
      <span role="cell" className="flex justify-end">
        {reader.commentCount > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground/80">
            <MessageSquare className="size-3" aria-hidden="true" />
            {reader.commentCount}
            <span className="sr-only">
              <Plural value={reader.commentCount} one="comment" other="comments" />
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">
            <span aria-hidden="true">—</span>
            <span className="sr-only">
              <Trans>no comments</Trans>
            </span>
          </span>
        )}
      </span>
    </div>
  )
}

function VersionLine({ data }: { data: DashboardData }) {
  const live = data.link.liveVersion
  const count = data.versions.length
  if (live === null && count === 0) return null
  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 rounded-xl border bg-card px-4 text-xs text-muted-foreground">
      <History className="size-4 shrink-0" aria-hidden="true" />
      {live !== null ? (
        <>
          <span className="font-semibold text-foreground">
            <Trans>v{live} is live</Trans>
          </span>
          <span aria-hidden="true" className="text-border">
            •
          </span>
        </>
      ) : null}
      <span>
        <Plural value={count} one="the first version you've shared" other="# versions shared" />
      </span>
      {data.versions[0] ? (
        <>
          <span aria-hidden="true" className="text-border">
            •
          </span>
          <span>
            <Trans>
              last shared <RelativeTime iso={data.versions[0].publishedAt} />
            </Trans>
          </span>
        </>
      ) : null}
    </div>
  )
}

