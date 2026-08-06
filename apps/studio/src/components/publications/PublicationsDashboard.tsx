import { useMemo, useState } from "react"
import { AlertTriangle, CloudOff, Globe, Link2, Loader2, RefreshCw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { publicationStateAt, type PublicationSummary } from "@adt/types"
import { apiErrorCode } from "@/api/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { PublishingSettingsLink } from "@/components/pipeline/stages/export/publish/PublishingSettingsLink"
import { usePublications, useResumeSharing, useStopSharing } from "@/hooks/use-publications"
import { PublicationRow } from "./PublicationRow"
import { PublicationsSummary } from "./PublicationsSummary"

type Filter = "all" | "live" | "stopped"

/** Newest first, always. The account has tens of publications, not thousands, so the whole
 *  shelf is one list with no pagination — and "the one I just published" is at the top. */
function applyFilter(publications: PublicationSummary[], filter: Filter): PublicationSummary[] {
  if (filter === "all") return publications
  return publications.filter((publication) =>
    filter === "live"
      ? publicationStateAt(publication) === "active"
      : publicationStateAt(publication) !== "active",
  )
}

interface PublicationsDashboardProps {
  /** Inside Settings the page already owns the scroll and padding, so the shelf drops
   *  its own page chrome and renders as a section. */
  embedded?: boolean
}

export function PublicationsDashboard({ embedded = false }: PublicationsDashboardProps) {
  const { t } = useLingui()
  const overview = usePublications()
  const stop = useStopSharing()
  const resume = useResumeSharing()
  const [filter, setFilter] = useState<Filter>("all")

  const notConnected = apiErrorCode(overview.error) === "publish_not_connected"
  const data = overview.data
  const publications = useMemo(
    () => applyFilter(data?.publications ?? [], filter),
    [data, filter],
  )

  if (overview.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Looking up your published books…</Trans>
      </div>
    )
  }

  if (notConnected) {
    return (
      <div data-testid="publications-not-connected" className="flex flex-1 flex-col">
        <StageEmptyState
          icon={CloudOff}
          color="amber"
          title={<Trans>Connect a Cloudflare account to publish books</Trans>}
          subtitle={
            <Trans>
              Published books live in your own Cloudflare account, so this list is empty until
              the Studio is connected to one. It is free and takes a few clicks.
            </Trans>
          }
          cta={
            <PublishingSettingsLink>
              <Link2 aria-hidden="true" />
              <Trans>Set up publishing</Trans>
            </PublishingSettingsLink>
          }
        />
      </div>
    )
  }

  if (overview.isError || !data) {
    return (
      <div
        data-testid="publications-load-error"
        className="m-6 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <Trans>We couldn't load your published books</Trans>
        </span>
        {overview.error?.message ? (
          <p className="text-xs leading-5 text-muted-foreground">{overview.error.message}</p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void overview.refetch()}
          disabled={overview.isFetching}
        >
          {overview.isFetching ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          <Trans>Try again</Trans>
        </Button>
      </div>
    )
  }

  const countsKnown = data.worker_reachable
  /** An empty shelf gets no tiles and no storage footnote: "0 kB of 10 GB free" and "every link
   *  is live" are both true and both useless, and the empty state is the whole message. */
  const nothingPublished = data.publications.length === 0
  const busyLabel = stop.isPending ? stop.variables : resume.isPending ? resume.variables : null

  return (
    <div className={cn("flex flex-col", embedded ? "gap-3" : "min-h-0 flex-1")}>
      {data.worker_reachable ? null : (
        <div
          data-testid="publications-worker-unreachable"
          className={cn(
            "flex items-center gap-2 border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none",
            embedded ? "rounded-lg border" : "border-b",
          )}
        >
          <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">
            <Trans>
              Your publishing service isn't answering, so this is what this computer remembers:
              sizes and comment counts are missing, and a book published from another computer
              won't be listed.
            </Trans>
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-4 mh:gap-3",
          embedded ? "p-0" : "min-h-0 flex-1 overflow-auto p-6 mh:p-4",
        )}
      >
        {nothingPublished ? null : (
          <PublicationsSummary totals={data.totals} countsKnown={countsKnown} />
        )}

        {nothingPublished ? (
          <div data-testid="publications-empty" className="flex flex-1 flex-col py-10">
            <StageEmptyState
              icon={Globe}
              color="violet"
              title={<Trans>Nothing published yet</Trans>}
              subtitle={
                <Trans>
                  Open a book, go to Export and choose Share online. You'll get a link to send to
                  readers, and everything they comment on comes back here.
                </Trans>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl<Filter>
                className="h-9 w-full max-w-xs"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "all", label: t`All` },
                  { value: "live", label: t`Live` },
                  { value: "stopped", label: t`Not shared` },
                ]}
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                <Trans>Showing {publications.length} of {data.publications.length}</Trans>
              </span>
            </div>

            {publications.length === 0 ? (
              <div
                data-testid="publications-filter-empty"
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 py-12 text-center text-xs text-muted-foreground"
              >
                <p>
                  {filter === "live" ? (
                    <Trans>None of your links is open to readers right now.</Trans>
                  ) : (
                    <Trans>Every one of your links is live.</Trans>
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFilter("all")}
                >
                  <Trans>Show all</Trans>
                </Button>
              </div>
            ) : (
              <ul
                aria-label={t`Published books`}
                className="flex list-none flex-col gap-3 p-0 mh:gap-2"
              >
                {publications.map((publication, index) => (
                  <PublicationRow
                    key={publication.token}
                    index={index}
                    publication={publication}
                    countsKnown={countsKnown}
                    busy={busyLabel === publication.book_label}
                    onStop={() => stop.mutate(publication.book_label)}
                    onResume={() => resume.mutate(publication.book_label)}
                  />
                ))}
              </ul>
            )}

            {stop.isError || resume.isError ? (
              <p
                data-testid="publications-action-error"
                role="alert"
                className="flex items-start gap-2 text-xs leading-5 text-amber-700"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {(stop.error ?? resume.error)?.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
