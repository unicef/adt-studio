import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CloudOff,
  Globe,
  Link2,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Search,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { publicationStateAt, type PublicationSummary } from "@adt/types"
import { apiErrorCode } from "@/api/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { PublishingSettingsLink } from "@/components/pipeline/stages/export/publish/PublishingSettingsLink"
import {
  useDeletePublication,
  usePublications,
  useResumeSharing,
  useStopSharing,
} from "@/hooks/use-publications"
import { PublicationRow } from "./PublicationRow"
import { PublicationsSkeleton } from "./PublicationsSkeleton"
import { PublicationsSummary } from "./PublicationsSummary"

type Filter = "all" | "live" | "stopped"

type Sort = "recent" | "feedback" | "size" | "title"

interface Query {
  filter: Filter
  sort: Sort
  search: string
  /** A separate switch rather than a fourth `Filter`, because "live" and "has something to
   *  read" are independent questions and the author usually asks both at once. */
  unresolvedOnly: boolean
}

const EMPTY_QUERY: Query = { filter: "all", sort: "recent", search: "", unresolvedOnly: false }

function matchesSearch(publication: PublicationSummary, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase()
  if (needle.length === 0) return true
  return (
    publication.title.toLocaleLowerCase().includes(needle) ||
    publication.book_label.toLocaleLowerCase().includes(needle)
  )
}

/** The account has tens of publications, not thousands, so the whole shelf is one list with no
 *  pagination: filtering and sorting run over the array the API already handed us. */
function applyQuery(publications: PublicationSummary[], query: Query): PublicationSummary[] {
  const kept = publications.filter((publication) => {
    if (query.filter !== "all") {
      const live = publicationStateAt(publication) === "active"
      if (query.filter === "live" ? !live : live) return false
    }
    if (query.unresolvedOnly && publication.unresolved_count === 0) return false
    return matchesSearch(publication, query.search)
  })

  const ordered = [...kept]
  switch (query.sort) {
    case "feedback":
      ordered.sort(
        (a, b) =>
          b.unresolved_count - a.unresolved_count ||
          b.comment_count - a.comment_count ||
          a.title.localeCompare(b.title),
      )
      break
    case "size":
      ordered.sort((a, b) => (b.snapshot_bytes ?? -1) - (a.snapshot_bytes ?? -1))
      break
    case "title":
      ordered.sort((a, b) => a.title.localeCompare(b.title))
      break
    default:
      /** `last_published_at` is null only for a publication whose versions are gone; those sort
       *  to the bottom rather than to 1970, where they would look freshly broken. */
      ordered.sort((a, b) =>
        (b.last_published_at ?? "").localeCompare(a.last_published_at ?? ""),
      )
  }
  return ordered
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
  const remove = useDeletePublication()
  const [query, setQuery] = useState<Query>(EMPTY_QUERY)

  const notConnected = apiErrorCode(overview.error) === "publish_not_connected"
  const data = overview.data
  const publications = useMemo(
    () => applyQuery(data?.publications ?? [], query),
    [data, query],
  )

  if (overview.isPending) {
    return <PublicationsSkeleton />
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
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<Filter>
                  className="h-9 w-full max-w-xs"
                  value={query.filter}
                  onValueChange={(filter) => setQuery((current) => ({ ...current, filter }))}
                  options={[
                    { value: "all", label: t`All` },
                    { value: "live", label: t`Live` },
                    { value: "stopped", label: t`Not shared` },
                  ]}
                />

                <Input
                  type="search"
                  value={query.search}
                  onChange={(event) =>
                    setQuery((current) => ({ ...current, search: event.target.value }))
                  }
                  placeholder={t`Search by title`}
                  aria-label={t`Search published books`}
                  prependIcon={<Search className="size-4" aria-hidden="true" />}
                  wrapperClassName="h-9 min-w-48 flex-1"
                  className="h-9 text-sm"
                />

                <Select
                  value={query.sort}
                  onValueChange={(sort) =>
                    setQuery((current) => ({ ...current, sort: sort as Sort }))
                  }
                >
                  <SelectTrigger className="h-9 w-44 text-xs" aria-label={t`Sort published books`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">{t`Recently updated`}</SelectItem>
                    <SelectItem value="feedback">{t`Most open feedback`}</SelectItem>
                    <SelectItem value="size">{t`Largest first`}</SelectItem>
                    <SelectItem value="title">{t`Title A–Z`}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant={query.unresolvedOnly ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={query.unresolvedOnly}
                  onClick={() =>
                    setQuery((current) => ({
                      ...current,
                      unresolvedOnly: !current.unresolvedOnly,
                    }))
                  }
                  className="h-7 gap-1.5 text-xs"
                >
                  <MessagesSquare className="size-3.5" aria-hidden="true" />
                  <Trans>Only with open feedback</Trans>
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <Trans>Showing {publications.length} of {data.publications.length}</Trans>
                </span>
              </div>
            </div>

            {publications.length === 0 ? (
              <div
                data-testid="publications-filter-empty"
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 py-12 text-center text-xs text-muted-foreground"
              >
                <p>
                  {query.search.trim().length > 0 ? (
                    <Trans>No published book matches “{query.search}”.</Trans>
                  ) : query.unresolvedOnly ? (
                    <Trans>Nothing is waiting for you — every thread is resolved.</Trans>
                  ) : query.filter === "live" ? (
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
                  onClick={() => setQuery(EMPTY_QUERY)}
                >
                  <Trans>Clear the filters</Trans>
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
                    deleting={remove.isPending && remove.variables?.token === publication.token}
                    onStop={() => stop.mutate(publication.book_label)}
                    onResume={() => resume.mutate(publication.book_label)}
                    onDelete={() =>
                      remove.mutate({
                        token: publication.token,
                        label: publication.book_label,
                      })
                    }
                  />
                ))}
              </ul>
            )}

            {stop.isError || resume.isError || remove.isError ? (
              <p
                data-testid="publications-action-error"
                role="alert"
                className="flex items-start gap-2 text-xs leading-5 text-amber-700"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {(stop.error ?? resume.error ?? remove.error)?.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
