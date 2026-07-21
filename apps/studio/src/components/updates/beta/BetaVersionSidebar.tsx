import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUp, Check, Loader2, RefreshCw, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { cn } from "@/lib/utils"
import {
  filterVersionsByQuery,
  formatReleaseDate,
} from "./beta-version-utils"
import { formatVersion } from "../release-banner-utils"

interface BetaVersionSidebarProps {
  versions: AvailableRelease[]
  selectedVersion?: string
  loading: boolean
  fetching: boolean
  refreshing: boolean
  interactionDisabled: boolean
  onSelect: (version: string) => void
  onRefresh: () => void
}

export function BetaVersionSidebar({
  versions,
  selectedVersion,
  loading,
  fetching,
  refreshing,
  interactionDisabled,
  onSelect,
  onRefresh,
}: BetaVersionSidebarProps) {
  const { t, i18n } = useLingui()
  const [search, setSearch] = useState("")
  const filteredVersions = useMemo(
    () => filterVersionsByQuery(versions, search),
    [versions, search],
  )

  return (
    <aside className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
      <div className="shrink-0 border-b p-3">
        <div className="flex gap-2">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t`Search versions…`}
            aria-label={t`Search versions`}
            prependIcon={<Search className="size-4" aria-hidden="true" />}
            disabled={loading || versions.length === 0}
            className="h-10 min-w-0 flex-1 bg-background text-sm"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={t`Refresh list`}
            title={t`Refresh list`}
            onClick={onRefresh}
            className="aspect-square"
            disabled={loading || refreshing || interactionDisabled}
          >
            <RefreshCw
              className={cn(
                refreshing && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      <div
        className="max-h-40 overflow-auto px-2 py-3 md:max-h-none md:flex-1"
        aria-label={t`Available beta versions`}
        aria-busy={fetching}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            <Trans>Loading versions…</Trans>
          </div>
        ) : versions.length === 0 ? (
          <p className="px-3 py-6 text-pretty text-sm text-muted-foreground">
            <Trans>No beta versions are available for this platform.</Trans>
          </p>
        ) : filteredVersions.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            <p className="text-pretty">
              <Trans>No versions match your search.</Trans>
            </p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-1 inline-flex h-10 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trans>Clear search</Trans>
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredVersions.map((release) => (
              <VersionOption
                key={release.version}
                release={release}
                locale={i18n.locale}
                selected={release.version === selectedVersion}
                onSelect={() => onSelect(release.version)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
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
        "flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left outline-none transition-[color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-primary/8 text-foreground shadow-sm ring-1 ring-primary/15"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span className="min-w-0">
        <span className="font-medium text-foreground">
          {formatVersion(release.version)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {release.releaseDate ? (
            <time dateTime={release.releaseDate}>
              {formatReleaseDate(release.releaseDate, locale)}
            </time>
          ) : (
            <Trans>Date unavailable</Trans>
          )}
          <DirectionLabel direction={release.direction} />
        </span>
      </span>
      <DirectionIcon direction={release.direction} />
    </button>
  )
}

function DirectionLabel({
  direction,
}: {
  direction: AvailableRelease["direction"]
}) {
  return (
    <>
      <span aria-hidden> · </span>
      <span
        className={cn(
          "font-medium",
          direction === "current" && "text-emerald-600 dark:text-emerald-400",
          direction === "upgrade" && "text-blue-600 dark:text-blue-400",
        )}
      >
        {direction === "current" ? (
          <Trans>Installed</Trans>
        ) : direction === "upgrade" ? (
          <Trans>Newer</Trans>
        ) : (
          <Trans>Older</Trans>
        )}
      </span>
    </>
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
