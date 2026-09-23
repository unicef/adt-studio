import { useRef, type KeyboardEvent } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { CheckCircle2, MessageSquare } from "lucide-react"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { cn } from "@/lib/utils"
import type { DashThread } from "./dashboard-data"
import { groupByPage, type FeedbackSort } from "./feedback-view"
import { initialOf } from "./helpers"

/**
 * The list half of the Feedback tab: every matching thread as one compact row, grouped under a
 * page heading when sorted by page. Arrow keys move the selection, which the detail follows.
 */
export function FeedbackList({
  threads,
  sort,
  selectedId,
  heldIds,
  onSelect,
}: {
  threads: DashThread[]
  sort: FeedbackSort
  selectedId: string | null
  heldIds: ReadonlySet<string>
  onSelect: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const index = threads.findIndex((thread) => thread.id === selectedId)
    const next = threads[Math.min(threads.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]
    if (!next) return
    onSelect(next.id)
    listRef.current?.querySelector<HTMLElement>(`[data-thread="${next.id}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const rows = (list: DashThread[]) =>
    list.map((thread) => (
      <Row
        key={thread.id}
        thread={thread}
        selected={thread.id === selectedId}
        held={heldIds.has(thread.id)}
        showPage={sort !== "page"}
        onSelect={() => onSelect(thread.id)}
      />
    ))

  return (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-activedescendant={selectedId ? `feedback-${selectedId}` : undefined}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none"
    >
      {sort === "page"
        ? groupByPage(threads).map((group) => (
            <div key={group.key} role="group" aria-labelledby={`feedback-group-${group.key}`}>
              <div id={`feedback-group-${group.key}`} className="sticky top-0 z-10 flex items-center justify-between border-b bg-muted/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground backdrop-blur">
                {group.pageNumber !== null ? <Trans>Page {group.pageNumber}</Trans> : <Trans>Somewhere in the book</Trans>}
                <span className="tabular-nums">{group.threads.length}</span>
              </div>
              {rows(group.threads)}
            </div>
          ))
        : rows(threads)}
    </div>
  )
}

function Row({
  thread,
  selected,
  held,
  showPage,
  onSelect,
}: {
  thread: DashThread
  selected: boolean
  held: boolean
  showPage: boolean
  onSelect: () => void
}) {
  const done = thread.resolved || held
  return (
    <button
      type="button"
      id={`feedback-${thread.id}`}
      data-thread={thread.id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-start gap-3 border-b px-4 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none",
        selected ? "bg-brand-50/70 dark:bg-brand-500/10" : "hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 bg-brand-600 transition-opacity duration-150 motion-reduce:transition-none",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden="true"
        style={{ backgroundColor: thread.authorColor }}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[11px] font-bold text-white transition-opacity",
          done && "opacity-50",
        )}
      >
        {initialOf(thread.authorName)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate text-[13px] font-semibold", done ? "text-muted-foreground" : "text-foreground")}>
            {thread.authorName}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/80">
            <RelativeTime iso={thread.lastActivityAt} />
          </span>
        </span>
        {showPage ? <span className="-mt-0.5 truncate text-[11px] text-muted-foreground">{thread.pageLabel}</span> : null}
        <span className={cn("line-clamp-2 text-[12.5px] leading-snug", done ? "text-muted-foreground" : "text-foreground/85")}>
          {thread.body}
        </span>
        <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {thread.replyCount > 0 ? (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" aria-hidden="true" />
              <Plural value={thread.replyCount} one="# reply" other="# replies" />
            </span>
          ) : null}
          {done ? (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              <Trans>Resolved</Trans>
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}
