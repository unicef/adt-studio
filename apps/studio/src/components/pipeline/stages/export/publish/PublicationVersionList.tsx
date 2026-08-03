import { Trans, useLingui } from "@lingui/react/macro"
import type { BookPublicationVersionRecord } from "@/api/client"
import { cn } from "@/lib/utils"
import { formatPublishDate } from "./expiry-options"

interface PublicationVersionListProps {
  versions: readonly BookPublicationVersionRecord[]
  currentVersion: number | null
}

/** Newest first: "v3 · published 2 Aug · 24 pages". */
export function PublicationVersionList({
  versions,
  currentVersion,
}: PublicationVersionListProps) {
  const { i18n } = useLingui()
  if (versions.length === 0) return null

  const ordered = [...versions].sort((a, b) => b.version - a.version)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Trans>Versions</Trans>
      </span>
      <ul className="flex flex-col">
        {ordered.map((entry) => {
          const isCurrent = entry.version === currentVersion
          return (
            <li
              key={entry.version}
              data-testid={`publish-version-${entry.version}`}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border/60 py-1.5 text-xs leading-5 last:border-b-0",
                isCurrent ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className={cn("font-mono", isCurrent && "font-medium")}>v{entry.version}</span>
              <span aria-hidden="true">·</span>
              <span>
                <Trans>published {formatPublishDate(entry.published_at, i18n.locale)}</Trans>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <Trans>{entry.page_count} pages</Trans>
              </span>
              {isCurrent && (
                <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <Trans>Live now</Trans>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
