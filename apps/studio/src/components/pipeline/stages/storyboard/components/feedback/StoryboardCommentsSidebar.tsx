import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { CheckCircle2, CloudOff, Loader2, MessagesSquare, X } from "lucide-react"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import { cn } from "@/lib/utils"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { ThreadRow } from "@/components/pipeline/stages/feedback/ThreadRow"
import {
  buildThreads,
  filterThreads,
  type FeedbackThread,
  type ResolutionFilter,
} from "@/components/pipeline/stages/feedback/lib/threads"
import {
  useAuthorIdentity,
  useDeleteOwnComment,
  useEditOwnComment,
  usePublicationComments,
  useReplyToThread,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { useBookPublication } from "@/hooks/use-book-publication"

interface StoryboardCommentsSidebarProps {
  bookLabel: string
  /** Every section of the page on screen, in the order they appear, so threads can be grouped
   *  the way the author sees them rather than by raw id. */
  sectionIds: readonly string[]
  /** The section being edited, highlighted in the list. */
  activeSectionId: string | null
  open: boolean
  onClose: () => void
  selectedThreadId: string | null
  onSelectThread: (threadId: string | null) => void
  /** Anchors that did not resolve in the preview, so the row can say the pin is missing. */
  missingPins: ReadonlySet<string>
}

/**
 * This page's reviewer threads, beside the page.
 *
 * The rows are the Feedback view's own `ThreadRow` — reply, resolve, edit and delete all behave
 * identically here, because they are literally the same component. What is *not* reused is that
 * view's panel: it carries realtime peers, a share button, a name prompt and a page-by-page
 * grouping for a two-pane screen this stage does not have.
 *
 * It follows the style editor's collapse (`w-[300px]` → `w-0`) so the storyboard has one way of
 * opening a side panel rather than two.
 */
export function StoryboardCommentsSidebar({
  bookLabel,
  sectionIds,
  activeSectionId,
  open,
  onClose,
  selectedThreadId,
  onSelectThread,
  missingPins,
}: StoryboardCommentsSidebarProps) {
  const { t } = useLingui()
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, open && published)
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const reply = useReplyToThread(bookLabel, identity.authorName)
  const resolve = useResolveThread(bookLabel, identity.authorName)
  const edit = useEditOwnComment(bookLabel, identity.authorName)
  const remove = useDeleteOwnComment(bookLabel, identity.authorName)
  const [resolution, setResolution] = useState<ResolutionFilter>("unresolved")

  const currentVersion = status.data?.publication?.current_version ?? 0
  const busyThreadId = reply.isPending || resolve.isPending ? selectedThreadId : null

  /** Grouped by section in page order: a flat list would put page 3's second paragraph next to
   *  its fifth with nothing to say they are different places. */
  const groups = useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? [])
    const kept = filterThreads(all, { resolution, pageSectionId: null })
    return sectionIds
      .map((sectionId, index) => ({
        sectionId,
        index,
        threads: kept
          .filter((thread) => thread.pageSectionId === sectionId)
          .sort((a, b) => Date.parse(a.root.created_at) - Date.parse(b.root.created_at)),
      }))
      .filter((group) => group.threads.length > 0)
  }, [comments.data, resolution, sectionIds])

  const total = groups.reduce((sum, group) => sum + group.threads.length, 0)
  /** Pin numbers are per section, matching the overlay: the third dot on a section is "3". */
  const pinNumbers = useMemo(() => {
    const numbers = new Map<string, number>()
    for (const group of groups) {
      group.threads.forEach((thread, index) => numbers.set(thread.root.id, index + 1))
    }
    return numbers
  }, [groups])

  return (
    <aside
      aria-label={t`Reviewer comments on this page`}
      aria-hidden={!open}
      data-testid="storyboard-comments-sidebar"
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
        "motion-reduce:transition-none",
        open ? "w-[320px]" : "w-0",
      )}
    >
      <div className="flex h-full w-[320px] flex-col border-l bg-background">
        <header className="flex flex-col gap-2.5 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
            <h2 className="flex-1 text-sm font-semibold tracking-tight">
              <Trans>Comments on this page</Trans>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t`Close the comments`}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <SegmentedControl<ResolutionFilter>
            className="h-8 w-full"
            value={resolution}
            onValueChange={setResolution}
            options={[
              { value: "unresolved", label: t`Waiting` },
              { value: "all", label: t`All` },
            ]}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!published ? (
            <p className="flex items-start gap-2 px-4 py-6 text-xs leading-5 text-muted-foreground">
              <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <Trans>
                This book has not been published, so there is no feedback on it yet. Publish it and
                reviewers' comments land here, on the pages they were left on.
              </Trans>
            </p>
          ) : comments.isPending ? (
            <p className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <Trans>Loading the comments…</Trans>
            </p>
          ) : total === 0 ? (
            <p className="flex items-start gap-2 px-4 py-6 text-xs leading-5 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {resolution === "unresolved" ? (
                <Trans>Nothing waiting on this page.</Trans>
              ) : (
                <Trans>No comments on this page.</Trans>
              )}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.sectionId} className="border-b last:border-b-0">
                <h3
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide",
                    group.sectionId === activeSectionId
                      ? "bg-indigo-50/70 text-indigo-700"
                      : "text-muted-foreground",
                  )}
                >
                  <Trans>Section {group.index + 1}</Trans>
                  {group.sectionId === activeSectionId ? (
                    <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                      <Trans>on screen</Trans>
                    </span>
                  ) : null}
                  <span className="ml-auto tabular-nums">{group.threads.length}</span>
                </h3>

                <ul className="flex list-none flex-col p-0">
                  {group.threads.map((thread: FeedbackThread) => (
                    <li key={thread.root.id}>
                      <ThreadRow
                        thread={thread}
                        pinNumber={pinNumbers.get(thread.root.id)}
                        currentVersion={currentVersion}
                        pinMissing={missingPins.has(thread.root.id)}
                        expanded={selectedThreadId === thread.root.id}
                        authorSessionId={null}
                        onSelect={() =>
                          onSelectThread(
                            selectedThreadId === thread.root.id ? null : thread.root.id,
                          )
                        }
                        onReply={async (body) => {
                          await reply.mutateAsync({
                            parentId: thread.root.id,
                            pageSectionId: thread.pageSectionId,
                            body,
                          })
                        }}
                        onResolve={async (resolved) => {
                          await resolve.mutateAsync({ id: thread.root.id, resolved })
                        }}
                        onEdit={async (id, body) => {
                          await edit.mutateAsync({ id, body })
                        }}
                        onDelete={async (id) => {
                          await remove.mutateAsync(id)
                        }}
                        busy={busyThreadId === thread.root.id}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
