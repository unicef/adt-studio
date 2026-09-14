import { Trans, useLingui } from "@lingui/react/macro"
import type { BookPublicationRecord } from "@/api/client"
import { formatPublishDateTime } from "@/components/pipeline/stages/publish/expiry-options"
import { cn } from "@/lib/utils"

/**
 * Every version this book has been published as, newest first, as a timeline.
 *
 * A rail with a dot per version rather than rows in a table: the shape of the thing is a history,
 * and a line down the left says so without a heading. The live one is filled and ringed; the rest
 * are hollow, which is the difference the author is scanning for.
 *
 * The list comes from the book's own record rather than the worker — it is written as each upload
 * finishes, so it survives the publishing service being unreachable, and a history that vanished
 * with the network would be worse than none.
 */
export function PublishingVersions({
  record,
  currentVersion,
}: {
  record: BookPublicationRecord | null
  currentVersion: number | null
}) {
  const { i18n } = useLingui()
  const versions = [...(record?.versions ?? [])].sort((a, b) => b.version - a.version)

  if (versions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
        <Trans>No versions yet — publishing this book will create the first one.</Trans>
      </p>
    )
  }

  return (
    <ol className="flex list-none flex-col p-0">
      {versions.map((entry, index) => {
        const isCurrent = entry.version === currentVersion
        const isLast = index === versions.length - 1
        return (
          <li
            key={entry.version}
            data-testid={`publication-version-${entry.version}`}
            className="flex gap-3"
          >
            {/* The rail: a dot for this version and the line down to the next one. It stops at
                the last entry so the history does not appear to continue past its own start. */}
            <span className="flex w-3 shrink-0 flex-col items-center pt-1.5" aria-hidden="true">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  isCurrent
                    ? "bg-emerald-500 ring-4 ring-emerald-100"
                    : "border-2 border-border bg-card",
                )}
              />
              {isLast ? null : <span className="w-px flex-1 bg-border" />}
            </span>

            <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", isLast ? "pb-0" : "pb-3")}>
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {`v${entry.version}`}
                </span>
                {isCurrent ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                    <Trans>Live</Trans>
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  <Trans>{entry.page_count} pages</Trans>
                </span>
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatPublishDateTime(entry.published_at, i18n.locale)}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
