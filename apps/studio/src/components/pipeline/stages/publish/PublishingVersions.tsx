import { Trans, useLingui } from "@lingui/react/macro"
import type { BookPublicationRecord } from "@/api/client"
import { formatPublishDateTime } from "@/components/pipeline/stages/export/publish/expiry-options"
import { cn } from "@/lib/utils"

/**
 * Every version this book has been published as, newest first.
 *
 * The list comes from the book's own record rather than the worker: it is written as each upload
 * finishes, so it is complete even when the publishing service cannot be reached — and a version
 * history that disappeared with the network would be worse than none.
 *
 * Capped in height rather than paginated. A book published forty times is unusual, and scrolling
 * a short list inside the page beats a control that has to be learned.
 */
export function PublishingVersions({ record, currentVersion }: {
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
    <ul className="flex max-h-64 list-none flex-col overflow-y-auto rounded-xl border bg-card p-0">
      {versions.map((entry, index) => {
        const isCurrent = entry.version === currentVersion
        return (
          <li
            key={entry.version}
            data-testid={`publication-version-${entry.version}`}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5",
              index > 0 && "border-t",
            )}
          >
            <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {`v${entry.version}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatPublishDateTime(entry.published_at, i18n.locale)}
            </span>
            {isCurrent ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <Trans>Live now</Trans>
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              <Trans>{entry.page_count} pages</Trans>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
