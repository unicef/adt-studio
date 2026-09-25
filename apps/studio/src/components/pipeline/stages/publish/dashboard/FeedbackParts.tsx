import { useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowUpDown, ArrowUpRight, CheckCircle2, Loader2, Search, SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { feedbackDestination } from "../feedback-destination"
import type { DashboardData, DashThread } from "./dashboard-data"
import { FeedbackPage } from "./FeedbackPage"
import { PanelEmpty } from "./DashboardPanel"
import type { FeedbackSort } from "./feedback-view"
import type { FeedbackWorkspace } from "./use-feedback-workspace"

/** Waiting / Resolved / All, search and sort — the same controls wherever a list is shown. */
export function FeedbackFilters({ ws }: { ws: FeedbackWorkspace }) {
  const { t } = useLingui()
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b p-3">
      <div role="group" aria-label={t`Which comments`} className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
        {(
          [
            ["waiting", <Trans key="w">Waiting</Trans>, ws.waitingNow],
            ["resolved", <Trans key="r">Resolved</Trans>, ws.stats.resolved],
            ["all", <Trans key="a">All</Trans>, ws.stats.waiting + ws.stats.resolved],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            aria-pressed={ws.view === id}
            onClick={() => ws.setView(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
              ws.view === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {ws.ready ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={ws.query}
            onChange={(event) => ws.setQuery(event.target.value)}
            placeholder={t`Search comments`}
            aria-label={t`Search feedback`}
            className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
    </div>
  )
}

/** Newest / Oldest / By page — in the panel's header, so the search keeps the full width. */
export function FeedbackSortMenu({ ws }: { ws: FeedbackWorkspace }) {
  const { t } = useLingui()
  return (
    <Select value={ws.sort} onValueChange={(value) => ws.setSort(value as FeedbackSort)}>
      <SelectTrigger
        aria-label={t`Sort feedback`}
        className="-mr-1 h-7 w-auto shrink-0 gap-1 border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus:ring-offset-0 motion-reduce:transition-none [&>svg]:size-3.5"
      >
        <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-36">
        <SelectItem value="newest" className="text-xs">{t`Newest`}</SelectItem>
        <SelectItem value="oldest" className="text-xs">{t`Oldest`}</SelectItem>
        <SelectItem value="page" className="text-xs">{t`By page`}</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** The list's empty state, worded for the filter that emptied it. */
export function FeedbackListEmpty({ ws }: { ws: FeedbackWorkspace }) {
  const calm = ws.view === "waiting" && ws.query === ""
  return (
    <PanelEmpty
      tone={calm ? "good" : "neutral"}
      icon={calm ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <Search className="size-5" aria-hidden="true" />}
      title={
        ws.query !== "" ? (
          <Trans>Nothing matches “{ws.query}”</Trans>
        ) : ws.view === "waiting" ? (
          <Trans>Nothing waiting on you</Trans>
        ) : ws.view === "resolved" ? (
          <Trans>Nothing resolved yet</Trans>
        ) : (
          <Trans>No feedback yet</Trans>
        )
      }
      body={
        ws.query !== "" ? (
          <Trans>Try another word, or look in All.</Trans>
        ) : ws.view === "resolved" ? (
          <Trans>Comments you resolve collect here, so you can look back or reopen them.</Trans>
        ) : (
          <Trans>When readers leave a comment, it lands here first.</Trans>
        )
      }
    />
  )
}

export function FeedbackUnavailable() {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card">
      <PanelEmpty
        tone="attention"
        icon={<AlertTriangle className="size-5" aria-hidden="true" />}
        title={<Trans>Can't reach the feedback</Trans>}
        body={<Trans>The sharing service isn't answering. Every comment is safe and comes back here once it does.</Trans>}
      />
    </section>
  )
}

/** The page on a soft backdrop, framed like a sheet of paper, with the comment's pin in view. */
export function PageSheet({
  bookLabel,
  ws,
  className,
}: {
  bookLabel: string
  ws: FeedbackWorkspace
  className?: string
}) {
  if (!ws.selected) return null
  return (
    <div data-page-scroll="" className={cn("min-h-0 overflow-y-auto overscroll-contain bg-muted/40 p-4 [scrollbar-gutter:stable]", className)}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
        <FeedbackPage
          key={ws.selected.pageSectionId}
          bookLabel={bookLabel}
          thread={ws.selected}
          threads={ws.samePage}
          onSelectThread={ws.setSelectedId}
          onLocate={ws.locate}
        />
      </div>
    </div>
  )
}

export function OpenPageLink({ bookLabel, thread }: { bookLabel: string; thread: DashThread }) {
  return (
    <Link
      {...feedbackDestination(bookLabel, thread.pageSectionId, thread.id)}
      className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none dark:text-brand-300 dark:hover:bg-brand-500/10"
    >
      <Trans>Open page in Storyboard</Trans>
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

/** The modifier for "send", as the keyboard in front of the author labels it. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- key names, not user text
const SEND_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"

/**
 * Answer the thread without leaving the page in view. ⌘/Ctrl+Enter sends. The reader sees the
 * reply on their copy; editing the page itself still happens in the Storyboard.
 */
export function ReplyComposer({
  data,
  thread,
  drafts,
}: {
  data: DashboardData
  thread: DashThread
  /** Where unsent replies wait, per thread, across remounts. */
  drafts: Map<string, string>
}) {
  const { t } = useLingui()
  const [body, setBodyState] = useState(() => drafts.get(thread.id) ?? "")
  const [failed, setFailed] = useState(false)
  const [focused, setFocused] = useState(false)
  const sending = useRef(false)
  const offline = !data.link.workerReachable
  const open = focused || body !== ""
  const setBody = (next: string) => {
    setBodyState(next)
    setFailed(false)
    if (next === "") drafts.delete(thread.id)
    else drafts.set(thread.id, next)
  }
  const send = async () => {
    const text = body.trim()
    if (text === "" || sending.current || offline) return
    sending.current = true
    setFailed(false)
    try {
      await data.reply(thread, text)
      setBody("")
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
          rows={open ? 3 : 1}
          disabled={offline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t`Reply to ${thread.authorName}…`}
          aria-label={t`Reply to ${thread.authorName}`}
          className="block w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none transition-[height] duration-200 placeholder:text-muted-foreground motion-reduce:transition-none"
        />
        <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
          <span className="min-w-0 truncate px-1 text-[11px] text-muted-foreground">
            {offline ? (
              <span className="text-amber-700 dark:text-amber-300">
                <Trans>Replies can be sent once the service is back.</Trans>
              </span>
            ) : failed ? (
              <span className="text-amber-700 dark:text-amber-300">
                <Trans>That reply didn't send. Try again.</Trans>
              </span>
            ) : (
              <Trans>{SEND_KEY} Enter to send · the reader sees it on their copy</Trans>
            )}
          </span>
          <Button size="sm" className="h-7 bg-brand-600 text-white hover:bg-brand-700" disabled={body.trim() === "" || data.replying || offline} onClick={() => void send()}>
            {data.replying ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <SendHorizontal aria-hidden="true" />
            )}
            <Trans>Reply</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The right-hand panel while the comments are still on their way: the page frame and a
 *  conversation's outline, so the layout doesn't jump when they land. */
export function FeedbackDetailLoading() {
  return (
    <section aria-busy="true" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <span className="h-3.5 w-32 rounded bg-muted motion-safe:animate-pulse" />
        <span className="sr-only">
          <Trans>Loading feedback</Trans>
        </span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="border-r bg-muted/40 p-4">
          <div className="aspect-[4/3] w-full rounded-lg bg-muted motion-safe:animate-pulse" />
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <span className="flex items-center gap-3">
            <span className="size-8 rounded-full bg-muted motion-safe:animate-pulse" />
            <span className="h-3 w-28 rounded bg-muted motion-safe:animate-pulse" />
          </span>
          <span className="h-3 w-4/5 rounded bg-muted/80 motion-safe:animate-pulse" />
          <span className="h-3 w-3/5 rounded bg-muted/70 motion-safe:animate-pulse" />
        </div>
      </div>
    </section>
  )
}
