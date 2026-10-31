import { useMemo } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { buildThreads, filterThreads } from "@/components/publication-feedback/lib/threads"
import { usePublicationComments } from "@/hooks/use-publication-feedback"

const PULSE = "animate-pulse motion-reduce:animate-none"
const BOX = "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3"

/**
 * What readers left that is still waiting on the author, in one line.
 *
 * The faces say who, the count says how much, and the newest comment — quoted — says enough of
 * what to tell a typo from "the answer key shows before the question". Reading and answering
 * them is the storyboard's job, where each comment sits on its own page, so the whole line is
 * the way there.
 */
export function DialogComments({ bookLabel, onReviewAll }: { bookLabel: string; onReviewAll: () => void }) {
  const { t } = useLingui()
  const comments = usePublicationComments(bookLabel, true)

  const threads = useMemo(() => {
    const all = buildThreads(comments.data?.comments ?? [])
    return filterThreads(all, { resolution: "unresolved", pageSectionId: null }).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    )
  }, [comments.data])

  if (comments.isPending) {
    return (
      <div aria-hidden className={BOX}>
        <span className={`size-6 shrink-0 rounded-full bg-muted ${PULSE}`} />
        <span className="flex flex-1 flex-col gap-1.5">
          <span className={`h-3 w-44 rounded bg-muted ${PULSE}`} />
          <span className={`h-3 w-3/4 rounded bg-muted/70 ${PULSE}`} />
        </span>
      </div>
    )
  }

  if (comments.isError) {
    return (
      <p className={`${BOX} text-[12.5px] text-muted-foreground`}>
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-hidden />
        <Trans>Comments couldn't be loaded right now. They're safe — try again in a moment.</Trans>
      </p>
    )
  }

  const newest = threads[0]
  if (!newest) return null
  const people = [...new Map(threads.map((thread) => [thread.root.author_name, thread.root])).values()]

  return (
    <button
      type="button"
      onClick={onReviewAll}
      aria-label={t`Review the comments waiting on you in the storyboard`}
      className={`group/cmt ${BOX} text-left transition-[background-color,border-color] duration-150 hover:border-brand-300 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200`}
    >
      <span className="flex shrink-0 -space-x-1.5" aria-hidden>
        {people.slice(0, 3).map((person) => (
          <span
            key={person.author_name}
            style={{ backgroundColor: person.author_color }}
            className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-background"
          >
            {[...person.author_name][0]?.toUpperCase() ?? "?"}
          </span>
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-semibold text-foreground">
          <Plural value={threads.length} one="# comment waiting on you" other="# comments waiting on you" />
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          <Trans>
            {newest.root.author_name}: “{newest.root.body}”
          </Trans>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-primary">
        <Trans>Review</Trans>
        <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/cmt:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </span>
    </button>
  )
}
