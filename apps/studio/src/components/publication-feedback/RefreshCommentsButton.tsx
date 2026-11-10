import { useLingui } from "@lingui/react/macro"
import { RefreshCw } from "lucide-react"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { cn } from "@/lib/utils"

/** Checks for new comments now, and says when they were last checked. */
export function RefreshCommentsButton({ bookLabel }: { bookLabel: string }) {
  const { t, i18n } = useLingui()
  const comments = usePublicationComments(bookLabel, true)
  const checkedAt = comments.dataUpdatedAt
    ? i18n.date(new Date(comments.dataUpdatedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null
  const label = checkedAt ? t`Check for new comments (last checked ${checkedAt})` : t`Check for new comments`
  return (
    <button
      type="button"
      onClick={() => void comments.refetch()}
      disabled={comments.isFetching}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-60"
    >
      <RefreshCw
        aria-hidden="true"
        className={cn("size-3.5 transition-transform duration-300", comments.isFetching && "animate-spin motion-reduce:animate-none")}
      />
    </button>
  )
}
