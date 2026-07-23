import { Trans } from "@lingui/react/macro"
import { TriangleAlert } from "lucide-react"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { formatBytes } from "@/lib/utils"
import { formatReleaseDate } from "./beta-version-utils"
import { formatVersion } from "../release-banner-utils"
import { ReleaseNotesMarkdown } from "../ReleaseNotesMarkdown"

interface BetaVersionDetailsProps {
  release?: AvailableRelease
  locale?: string
  error?: string
}

export function BetaVersionDetails({
  release,
  locale,
  error,
}: BetaVersionDetailsProps) {
  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background">
      {release ? (
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">
                  {formatVersion(release.version)}
                </span>
                {release.direction === "current" && <CurrentVersionBadge />}
                {release.direction === "downgrade" && <DowngradeBadge />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {release.releaseDate && (
                  <time dateTime={release.releaseDate}>
                    {formatReleaseDate(release.releaseDate, locale)}
                  </time>
                )}
                {release.releaseDate && release.totalBytes != null && (
                  <span aria-hidden> · </span>
                )}
                {release.totalBytes != null && formatBytes(release.totalBytes)}
              </p>
            </div>
          </div>

          {release.direction === "downgrade" && <DowngradeWarning />}

          <section className="mt-4 max-w-[80ch]">
            <h3 className="mb-3 text-balance text-sm font-semibold">
              <Trans>Release notes</Trans>
            </h3>
            {release.releaseNotes?.trim() ? (
              <ReleaseNotesMarkdown>{release.releaseNotes}</ReleaseNotesMarkdown>
            ) : (
              <p className="rounded-xl bg-muted/30 px-4 py-3 text-pretty text-sm text-muted-foreground ring-1 ring-black/5 dark:ring-white/10">
                <Trans>No release notes were provided for this version.</Trans>
              </p>
            )}
          </section>
        </div>
      ) : (
        <div className="flex min-h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          <Trans>Select a version to see its release notes.</Trans>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-5 mb-4 rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20"
        >
          {error}
        </div>
      )}
    </main>
  )
}

function DowngradeWarning() {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-pretty text-sm text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <Trans>
          Installing an older version can break books or settings that were
          created or edited with a newer one. Back up your books before
          downgrading.
        </Trans>
      </span>
    </div>
  )
}

function CurrentVersionBadge() {
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
      <Trans>Current version</Trans>
    </span>
  )
}

function DowngradeBadge() {
  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400">
      <Trans>Downgrade</Trans>
    </span>
  )
}
