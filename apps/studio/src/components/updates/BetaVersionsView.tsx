import { Trans, useLingui } from "@lingui/react/macro"
import dayjs, { type Dayjs } from "dayjs"
import "dayjs/locale/en"
import "dayjs/locale/es"
import "dayjs/locale/fr"
import "dayjs/locale/pt-br"
import "dayjs/locale/sq"
import isoWeek from "dayjs/plugin/isoWeek"
import localizedFormat from "dayjs/plugin/localizedFormat"
import {
  ArrowUp,
  Check,
  Download,
  FlaskConical,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogTitle } from "@/components/ui/dialog"
import type { AvailableRelease, UpdateStatus } from "@/hooks/use-update-status"
import {
  useBetaUpdateVersions,
  useInstallBetaVersion,
} from "@/hooks/use-beta-update-versions"
import { cn, formatBytes } from "@/lib/utils"
import { formatVersion } from "./release-banner-utils"
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown"

interface BetaVersionsViewProps {
  status: UpdateStatus
  currentVersion?: string | null
  onClose: () => void
}

dayjs.extend(isoWeek)
dayjs.extend(localizedFormat)

const EMPTY_RELEASES: AvailableRelease[] = []
const dayjsUnit = "isoWeek" as const
const dayjsFormat = "MMMM YYYY"

export function BetaVersionsView({
  status,
  currentVersion,
  onClose,
}: BetaVersionsViewProps) {
  const { t, i18n } = useLingui()
  const [selectedVersion, setSelectedVersion] = useState<string>()
  const versionsQuery = useBetaUpdateVersions(currentVersion)
  const installMutation = useInstallBetaVersion()
  const versions = versionsQuery.data ?? EMPTY_RELEASES
  const loading = versionsQuery.isPending
  const refreshing = versionsQuery.isFetching && !loading
  const preparing = installMutation.isPending
  const detectedVersion =
    status.phase === "available" ? status.version : undefined

  useEffect(() => {
    setSelectedVersion((previous) => {
      if (
        previous &&
        versions.some((release) => release.version === previous)
      ) {
        return previous
      }
      return (
        versions.find((release) => release.version === detectedVersion)
          ?.version ??
        versions.find((release) => release.direction === "upgrade")?.version ??
        versions.find((release) => release.direction === "current")?.version ??
        versions[0]?.version
      )
    })
  }, [detectedVersion, versions])

  const selected = useMemo(
    () => versions.find((release) => release.version === selectedVersion),
    [selectedVersion, versions],
  )
  const groupedVersions = useMemo(
    () => groupVersionsByReleaseDate(versions),
    [versions],
  )

  const startInstall = () => {
    if (!selected || selected.direction === "current") return
    installMutation.mutate(selected.version)
  }

  const requestError = installMutation.error ?? versionsQuery.error
  const error = requestError
    ? requestError instanceof Error
      ? requestError.message
      : String(requestError)
    : undefined

  return (
    <div className="flex h-200 max-h-[calc(100vh-2rem)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <FlaskConical className="size-5" />
        </div>
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold">
            <Trans>Beta versions</Trans>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            <Trans>Choose any available beta version to install.</Trans>
          </p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 sm:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="min-h-0 border-b  sm:border-b-0 sm:border-r">
          <div
            className="max-h-40 overflow-auto py-4 px-2 sm:max-h-none sm:h-[calc(100%-2.5rem)]"
            aria-label={t`Available beta versions`}
            aria-busy={versionsQuery.isFetching}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                <Trans>Loading versions…</Trans>
              </div>
            ) : versions.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                <Trans>No beta versions are available for this platform.</Trans>
              </p>
            ) : (
              <div className="space-y-6">
                {groupedVersions.map((group) => (
                  <section key={group.key}>
                    <h3 className="px-3 pb-1.5 text-xs capitalize font-semibold text-muted-foreground">
                      <DateGroupLabel group={group} locale={i18n.locale} />
                    </h3>
                    <div className="space-y-1">
                      {group.releases.map((release) => (
                        <VersionOption
                          key={release.version}
                          release={release}
                          locale={i18n.locale}
                          selected={release.version === selectedVersion}
                          onSelect={() => setSelectedVersion(release.version)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {selected ? (
            <>
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums">
                      {formatVersion(selected.version)}
                    </span>
                    {selected.direction === "current" && (
                      <CurrentVersionBadge />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.releaseDate &&
                      formatReleaseDate(selected.releaseDate, i18n.locale)}
                    {selected.releaseDate && selected.totalBytes != null && (
                      <span aria-hidden> · </span>
                    )}
                    {selected.totalBytes != null &&
                      formatBytes(selected.totalBytes)}
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto border-y px-5 py-4">
                <h3 className="mb-3 text-sm font-semibold">
                  <Trans>Release notes</Trans>
                </h3>
                {selected.releaseNotes?.trim() ? (
                  <ReleaseNotesMarkdown>
                    {selected.releaseNotes}
                  </ReleaseNotesMarkdown>
                ) : (
                  <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <Trans>
                      No release notes were provided for this version.
                    </Trans>
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              <Trans>Select a version to see its release notes.</Trans>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mx-5 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => void versionsQuery.refetch()}
          disabled={loading || refreshing || preparing}
        >
          <RefreshCw
            className={cn(
              refreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
          <Trans>Refresh list</Trans>
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose} disabled={preparing}>
            <Trans>Close</Trans>
          </Button>
          <Button
            onClick={startInstall}
            disabled={
              !selected ||
              selected.direction === "current" ||
              preparing ||
              status.phase === "checking"
            }
          >
            {preparing ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : selected?.direction === "current" ? (
              <Check />
            ) : (
              <Download />
            )}
            {preparing ? (
              <Trans>Preparing…</Trans>
            ) : selected?.direction === "downgrade" ? (
              <Trans>Install older version</Trans>
            ) : selected?.direction === "current" ? (
              <Trans>Installed</Trans>
            ) : (
              <Trans>Install update</Trans>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function VersionOption({
  release,
  locale,
  selected,
  onSelect,
}: {
  release: AvailableRelease
  locale?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-background text-foreground ring-1 ring-border"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <span className="min-w-0">
        <span className="tabular-nums font-medium text-foreground">
          {formatVersion(release.version)}
        </span>
        <span className="block truncate text-xs">
          {release.releaseDate ? (
            <time dateTime={release.releaseDate}>
              {formatReleaseDate(release.releaseDate, locale)}
            </time>
          ) : (
            <Trans>Date unavailable</Trans>
          )}
        </span>
      </span>
      <DirectionIcon direction={release.direction} />
    </button>
  )
}

function DirectionIcon({
  direction,
}: {
  direction: AvailableRelease["direction"]
}) {
  if (direction === "upgrade") {
    return <ArrowUp className="size-4 shrink-0 text-blue-500" />
  }
  if (direction === "current") {
    return <Check className="size-4 shrink-0 text-emerald-500" />
  }
  return null
}

function CurrentVersionBadge() {
  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <Trans>Current version</Trans>
    </span>
  )
}

type DateGroupKind =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "month"
  | "unknown"

interface ReleaseDateGroup {
  key: string
  kind: DateGroupKind
  month?: Dayjs
  releases: AvailableRelease[]
}

export function groupVersionsByReleaseDate(
  versions: AvailableRelease[],
  now: Date | string | number | Dayjs = dayjs(),
): ReleaseDateGroup[] {
  const reference = dayjs(now)
  const startToday = reference.startOf("day").valueOf()
  const startTomorrow = reference.add(1, "day").startOf("day").valueOf()
  const startYesterday = reference.subtract(1, "day").startOf("day").valueOf()
  const startThisWeek = reference.startOf(dayjsUnit).valueOf()
  const startLastWeek = reference
    .subtract(1, "week")
    .startOf(dayjsUnit)
    .valueOf()

  const sorted = [...versions].sort((left, right) => {
    return releaseTimestamp(right) - releaseTimestamp(left)
  })
  const groups = new Map<string, ReleaseDateGroup>()

  for (const release of sorted) {
    const date = parseReleaseDate(release.releaseDate)
    let group: Omit<ReleaseDateGroup, "releases">

    if (!date) {
      group = { key: "unknown", kind: "unknown" }
    } else if (date.valueOf() >= startToday && date.valueOf() < startTomorrow) {
      group = { key: "today", kind: "today" }
    } else if (
      date.valueOf() >= startYesterday &&
      date.valueOf() < startToday
    ) {
      group = { key: "yesterday", kind: "yesterday" }
    } else if (
      date.valueOf() >= startThisWeek &&
      date.valueOf() < startYesterday
    ) {
      group = { key: "this-week", kind: "this-week" }
    } else if (
      date.valueOf() >= startLastWeek &&
      date.valueOf() < startThisWeek
    ) {
      group = { key: "last-week", kind: "last-week" }
    } else {
      const month = date.startOf("month")
      group = {
        key: `month-${month.format("YYYY-MM")}`,
        kind: "month",
        month,
      }
    }

    const existing = groups.get(group.key)
    if (existing) {
      existing.releases.push(release)
    } else {
      groups.set(group.key, { ...group, releases: [release] })
    }
  }

  return [...groups.values()]
}

function DateGroupLabel({
  group,
  locale,
}: {
  group: ReleaseDateGroup
  locale?: string
}) {
  if (group.kind === "today") return <Trans>Today</Trans>
  if (group.kind === "yesterday") return <Trans>Yesterday</Trans>
  if (group.kind === "this-week") return <Trans>This week</Trans>
  if (group.kind === "last-week") return <Trans>Last week</Trans>
  if (group.kind === "month" && group.month) {
    return group.month.locale(resolveDayjsLocale(locale)).format(dayjsFormat)
  }
  return <Trans>Date unavailable</Trans>
}

function formatReleaseDate(value: string, locale?: string): string {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  return parsed.locale(resolveDayjsLocale(locale)).format("ll")
}

function parseReleaseDate(value?: string): Dayjs | undefined {
  if (!value) return undefined
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : undefined
}

function releaseTimestamp(release: AvailableRelease): number {
  return (
    parseReleaseDate(release.releaseDate)?.valueOf() ?? Number.NEGATIVE_INFINITY
  )
}

function resolveDayjsLocale(locale?: string): string {
  const locales: Record<string, string> = {
    en: "en",
    es: "es",
    fr: "fr",
    "pt-BR": "pt-br",
    sq: "sq",
  }
  return locales[locale ?? ""] ?? "en"
}
