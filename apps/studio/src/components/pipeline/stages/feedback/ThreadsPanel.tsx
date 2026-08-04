import { useCallback, useRef, type KeyboardEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { MessageSquareDashed, RefreshCw, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RoomPeer } from "@adt/types"
import { AuthorNameField } from "./AuthorNameField"
import { PresenceChip } from "./PresenceChip"
import { ThreadRow } from "./ThreadRow"
import type { AuthorIdentity } from "@/hooks/use-publication-feedback"
import type { PageThreadGroup, ResolutionFilter, ThreadFilters } from "./lib/threads"

export interface ThreadsPanelProps {
  groups: PageThreadGroup[]
  pinNumbers: Map<string, number>
  currentVersion: number
  unresolvedCount: number
  totalCount: number
  /** False while the comment list has never answered — an unreachable worker must not be
   *  reported as "All resolved". */
  countKnown: boolean
  missingPins: Set<string>
  filters: ThreadFilters
  onFiltersChange: (next: ThreadFilters) => void
  currentPageSectionId: string | null
  currentPageLabel: string | null
  selectedThreadId: string | null
  onSelectThread: (threadId: string) => void
  authorSessionId: string | null
  identity: AuthorIdentity
  showNamePrompt: boolean
  announcement: string
  isRefreshing: boolean
  onRefresh: () => void
  onReply: (threadId: string, pageSectionId: string, body: string) => Promise<void>
  onResolve: (threadId: string, resolved: boolean) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  busyThreadId: string | null
  onOpenShare: () => void
  /** Reviewers in the realtime room right now, the author excluded. */
  livePeers: RoomPeer[]
}

export function ThreadsPanel({
  groups,
  pinNumbers,
  currentVersion,
  unresolvedCount,
  totalCount,
  countKnown,
  missingPins,
  filters,
  onFiltersChange,
  currentPageSectionId,
  currentPageLabel,
  selectedThreadId,
  onSelectThread,
  authorSessionId,
  identity,
  showNamePrompt,
  announcement,
  isRefreshing,
  onRefresh,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  busyThreadId,
  onOpenShare,
  livePeers,
}: ThreadsPanelProps) {
  const { t } = useLingui()
  const listRef = useRef<HTMLDivElement>(null)

  /** Up and down move between threads without leaving the list, which is what makes a long
   *  page of feedback workable from the keyboard; Tab still reaches the controls inside the
   *  open thread. */
  const onListKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-thread-row]") ?? [],
    )
    if (rows.length === 0) return
    const index = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (index === -1) return
    event.preventDefault()
    const next = event.key === "ArrowDown" ? index + 1 : index - 1
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus()
  }, [])

  const setResolution = (resolution: ResolutionFilter) =>
    onFiltersChange({ ...filters, resolution })

  const isEmpty = groups.length === 0

  return (
    <aside
      aria-label={t`Reviewer feedback`}
      className="flex w-[360px] shrink-0 flex-col border-l bg-background"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Feedback</Trans>
        </h3>
        {countKnown ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors duration-200",
              unresolvedCount > 0 ? "bg-indigo-600 text-white" : "bg-emerald-100 text-emerald-800",
            )}
          >
            {unresolvedCount > 0
              ? t`${unresolvedCount} open`
              : totalCount === 0
                ? t`None yet`
                : t`All resolved`}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {t`—`}
          </span>
        )}
        <PresenceChip peers={livePeers} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 w-7 p-0"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={t`Check for new feedback`}
          aria-label={t`Check for new feedback`}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing ? "animate-spin" : null)}
            aria-hidden
          />
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-b px-3 py-2">
        <div
          role="group"
          aria-label={t`Show`}
          className="inline-flex w-fit items-center rounded-md bg-muted p-0.5"
        >
          <FilterButton
            active={filters.resolution === "unresolved"}
            onClick={() => setResolution("unresolved")}
            label={t`Unresolved`}
          />
          <FilterButton
            active={filters.resolution === "all"}
            onClick={() => setResolution("all")}
            label={t`All`}
          />
        </div>

        <div
          role="group"
          aria-label={t`Pages`}
          className="inline-flex w-fit items-center rounded-md bg-muted p-0.5"
        >
          <FilterButton
            active={filters.pageSectionId === null}
            onClick={() => onFiltersChange({ ...filters, pageSectionId: null })}
            label={t`All pages`}
          />
          <FilterButton
            active={filters.pageSectionId !== null}
            disabled={currentPageSectionId === null}
            onClick={() =>
              onFiltersChange({ ...filters, pageSectionId: currentPageSectionId })
            }
            label={currentPageLabel ?? t`This page`}
          />
        </div>
      </div>

      <AuthorNameField identity={identity} showPrompt={showNamePrompt} />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div
        ref={listRef}
        onKeyDown={onListKeyDown}
        className="flex-1 overflow-y-auto px-2 py-2"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <MessageSquareDashed className="h-5 w-5" aria-hidden />
            {!countKnown ? (
              <p>
                <Trans>Feedback could not be loaded.</Trans>
              </p>
            ) : totalCount === 0 ? (
              <>
                <p>
                  <Trans>
                    Nobody has commented yet. Send the share link to a colleague or a class —
                    they can pin a comment straight onto the page.
                  </Trans>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={onOpenShare}
                >
                  <Share2 className="h-3 w-3" aria-hidden />
                  <Trans>Get the share link</Trans>
                </Button>
              </>
            ) : filters.resolution === "unresolved" ? (
              <p>
                <Trans>Nothing left open here. Switch to All to see resolved threads.</Trans>
              </p>
            ) : (
              <p>
                <Trans>No comments match these filters.</Trans>
              </p>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.pageSectionId} className="mb-3">
              <h4 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {group.page ? (
                  group.page.page_number === undefined ? (
                    group.page.section_id
                  ) : (
                    t`Page ${group.page.page_number}`
                  )
                ) : (
                  <Trans>Pages no longer published</Trans>
                )}
              </h4>
              <ul className="flex flex-col gap-1">
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.root.id}
                    thread={thread}
                    pinNumber={pinNumbers.get(thread.root.id)}
                    currentVersion={currentVersion}
                    pinMissing={missingPins.has(thread.root.id)}
                    expanded={selectedThreadId === thread.root.id}
                    authorSessionId={authorSessionId}
                    busy={busyThreadId === thread.root.id}
                    onSelect={() => onSelectThread(thread.root.id)}
                    onReply={(body) => onReply(thread.root.id, thread.pageSectionId, body)}
                    onResolve={(resolved) => onResolve(thread.root.id, resolved)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}

function FilterButton({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled ? "cursor-default opacity-50" : null,
      )}
    >
      {label}
    </button>
  )
}
