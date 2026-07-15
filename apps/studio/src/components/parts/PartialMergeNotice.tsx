import { AlertTriangle } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useSplitStatus } from "../../hooks/use-parts"
import { fmtRange } from "./parts-utils"

/**
 * Warns when a book-level stage is run over a split book that isn't fully
 * merged yet: results here aggregate across the book, so any pages not yet
 * merged back are silently left out. Only shows for a split source book with
 * exported parts still outstanding — hidden for normal or fully-merged books.
 */
export function PartialMergeNotice({ bookLabel }: { bookLabel: string }) {
  const { data: status } = useSplitStatus(bookLabel)
  if (!status || status.exported.length === 0 || status.missingRanges.length === 0) {
    return null
  }
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <p>
        <Trans>
          This book isn't fully assembled yet — pages{" "}
          <span className="font-semibold tabular-nums">
            {status.missingRanges.map(fmtRange).join(", ")}
          </span>{" "}
          haven't been merged back. Anything you run here covers only the merged
          pages, so the result will be incomplete until every part is merged.
        </Trans>
      </p>
    </div>
  )
}
