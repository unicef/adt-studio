import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Loader2 } from "lucide-react"
import { apiErrorCode } from "@/api/client"
import {
  buildThreads,
  filterThreads,
} from "@/components/publication-feedback/lib/threads"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import {
  useAuthorIdentity,
  usePublicationPages,
  usePublicationComments,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import { feedbackDestination } from "./feedback-destination"
import { cn } from "@/lib/utils"

/**
 * Every thread still waiting on the author, newest first, on the page it was left on.
 *
 * It used to show three. The count above said eight, the list showed three, and the other five
 * were reachable only by leaving for the Storyboard and hunting — so the panel that exists to
 * say what is outstanding was the one place that would not tell you. This sits in a `ScrollBox`
 * with a bounded row, so showing all of them costs a scrollbar and nothing else.
 *
 * Rows open the Storyboard rather than trying to answer here: replying wants the page beside
 * it, and that is exactly what the storyboard has. Resolving, which needs no page, happens
 * here — so a thread that is done can leave this list without a round trip.
 */
export function PublishingRecentFeedback({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const comments = usePublicationComments(bookLabel, true)
  const pages = usePublicationPages(bookLabel, true)
  /** Resolving is the other half of reading: a thread the author has dealt with should be able
   *  to leave this list from here, rather than only from the page it was left on. */
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const resolve = useResolveThread(bookLabel, identity.authorName)

  const threads = useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? [])
    return filterThreads(all, { resolution: "unresolved", pageSectionId: null }).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    )
  }, [comments.data])

  const pageLabel = (sectionId: string): string => {
    const entry = pages.data?.pages.find((page) => page.section_id === sectionId)
    const number = entry?.page_number
    /** A comment whose page is not in this version's manifest gets the honest label rather than
     *  a page number invented from its position. */
    return number === undefined ? t`Somewhere in the book` : t`Page ${number}`
  }

  if (comments.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Looking for new feedback…</Trans>
      </div>
    )
  }

  /* Returning null here left a headed section with nothing under it — indistinguishable from
   * "no feedback", which is the opposite claim. The section says what it doesn't know, in the
   * same words the rest of the dashboard uses. */
  if (comments.isError) {
    const notConnected = apiErrorCode(comments.error) === "publish_not_connected"
    return (
      <div
        data-testid="publish-feedback-unavailable"
        className="flex items-start gap-2 text-xs leading-5 text-amber-700"
      >
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {notConnected ? (
          <Trans>Connect a Cloudflare account to see reader feedback.</Trans>
        ) : (
          <Trans>Service not answering — feedback will appear once it does.</Trans>
        )}
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div
        data-testid="publish-feedback-clear"
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
        <Trans>No feedback waiting — every thread on this book is resolved.</Trans>
      </div>
    )
  }

  return (
    <div className="-mx-4 -my-3 flex flex-col divide-y">
      {threads.map((thread) => (
        <div key={thread.root.id} className="group flex items-start transition-colors hover:bg-muted/50">
          <Link
            {...feedbackDestination(bookLabel, thread.pageSectionId, thread.root.id)}
            className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-2.5"
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: thread.root.author_color }}
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[10px] font-bold text-white"
            >
              {[...thread.root.author_name][0]?.toUpperCase() ?? "?"}
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold text-foreground">
                  {thread.root.author_name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {pageLabel(thread.pageSectionId)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <RelativeTime iso={thread.root.created_at} />
                </span>
              </span>
              <span className="line-clamp-2 text-xs leading-snug text-foreground/85">
                {thread.root.body}
              </span>
              {thread.replyCount > 0 ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {thread.replyCount === 1 ? (
                    <Trans>1 reply</Trans>
                  ) : (
                    <Trans>{thread.replyCount} replies</Trans>
                  )}
                </span>
              ) : null}
            </span>

            <ArrowRight
              className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Link>

          {/* Outside the Link, not inside it: a button nested in an anchor is activated by the
              anchor's own keyboard handling, so resolving would also navigate away from the list
              it is meant to shorten. */}
          <button
            type="button"
            data-testid="publish-feedback-resolve"
            title={t`Mark this thread resolved`}
            aria-label={t`Mark ${thread.root.author_name}'s comment resolved`}
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: thread.root.id, resolved: true })}
            className={cn(
              "mr-3 mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
              "border-transparent text-muted-foreground/70 transition-colors",
              "hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {resolve.isPending && resolve.variables?.id === thread.root.id ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      ))}
    </div>
  )
}
