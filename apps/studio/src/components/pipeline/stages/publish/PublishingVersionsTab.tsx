import { Trans, useLingui } from "@lingui/react/macro"
import { History, Loader2 } from "lucide-react"
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { useBookPublication } from "@/hooks/use-book-publication"
import { formatPublishDateTime } from "@/components/pipeline/stages/export/publish/expiry-options"

/**
 * Every version this book has been published as, newest first.
 *
 * The list comes from the book's own record rather than the worker: it is written as each
 * upload finishes, so it is complete even when the publishing service cannot be reached — and a
 * version history that disappears with the network would be worse than none.
 */
export function PublishingVersionsTab({ bookLabel }: { bookLabel: string }) {
  const { i18n } = useLingui()
  const status = useBookPublication(bookLabel)

  if (status.isPending) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Reading this book's publishing history…</Trans>
      </div>
    )
  }

  const record = status.data?.record ?? null
  const versions = [...(record?.versions ?? [])].sort((a, b) => b.version - a.version)
  const current = status.data?.publication?.current_version ?? versions[0]?.version ?? null

  if (versions.length === 0) {
    return (
      <StageEmptyState
        icon={History}
        color="violet"
        title={<Trans>Nothing published yet</Trans>}
        subtitle={
          <Trans>
            Once you publish, every version you put online is listed here — what changed is the
            book itself, so the list is your record of when readers saw what.
          </Trans>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-muted-foreground">
        <Trans>
          Readers always open the newest version. Earlier ones stay in your Cloudflare account
          and still count towards its storage.
        </Trans>
      </p>

      <ul className="flex list-none flex-col gap-2 p-0">
        {versions.map((entry) => {
          const isCurrent = entry.version === current
          return (
            <li
              key={entry.version}
              data-testid={`publication-version-${entry.version}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3"
            >
              <span className="text-sm font-semibold tabular-nums text-foreground">
                <Trans>Version {entry.version}</Trans>
              </span>
              {isCurrent ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <Trans>Live now</Trans>
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {formatPublishDateTime(entry.published_at, i18n.locale)}
              </span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                <Trans>{entry.page_count} pages</Trans>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
