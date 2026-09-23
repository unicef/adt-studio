import { useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CloudOff,
  Globe,
  Link2,
  Link2Off,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Search,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
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
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { PublishingSettingsLink } from "@/components/pipeline/stages/publish/PublishingSettingsLink"
import {
  useDeletePublication,
  usePublications,
  useResumeSharing,
  useStopSharing,
} from "@/hooks/use-publications"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PublicationCard } from "./PublicationCard"
import { HostUpdatesBanner } from "./HostUpdatesBanner"
import { useHostUpdates } from "@/hooks/use-host-updates"
import { EMPTY_QUERY, PublicationsToolbar, type Query } from "./PublicationsToolbar"
import { PublicationsSkeleton } from "./PublicationsSkeleton"
import { PublicationsSummary } from "./PublicationsSummary"


function FilteredEmptyState({
  icon,
  title,
  onClear,
}: {
  icon: typeof Globe
  title: ReactNode
  onClear: () => void
}) {
  return (
    <div
      data-testid="publications-filter-empty"
      className="flex min-h-64 flex-col rounded-xl border border-dashed bg-muted/20 px-5 py-10"
    >
      <StageEmptyState
        icon={icon}
        color="violet"
        title={title}
        cta={
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <Trans>Clear the filters</Trans>
          </Button>
        }
      />
    </div>
  )
}

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
  const overview = usePublications()
  const stop = useStopSharing()
  const resume = useResumeSharing()
  const remove = useDeletePublication()
  const hostUpdates = useHostUpdates()
  const [query, setQuery] = useState<Query>(EMPTY_QUERY)
  /** Delete is irreversible and one click deep in a menu, so it asks first. The old row grew a
   *  confirm in place; a menu closes on click, so the question needs its own surface. */
  const [pendingDelete, setPendingDelete] = useState<PublicationSummary | null>(null)

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
          title={<Trans>Connect a Cloudflare account to share books</Trans>}
          subtitle={
            <Trans>
              Shared books live in your own Cloudflare account, so this list is empty until
              the Studio is connected to one. It is free and takes a few clicks.
            </Trans>
          }
          cta={
            <PublishingSettingsLink>
              <Link2 aria-hidden="true" />
              <Trans>Set up sharing</Trans>
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
          <Trans>We couldn't load your shared books</Trans>
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
  /** An empty shelf keeps the dashboard it will grow into: the same sections in the same places,
   *  each saying what belongs there. One full-screen message instead taught nothing about the
   *  screen and made the first share feel like a different page. */
  const nothingPublished = data.publications.length === 0
  const busyLabel = stop.isPending ? stop.variables : resume.isPending ? resume.variables : null

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded && "gap-4")}>
      {data.worker_reachable ? null : (
        <div
          data-testid="publications-worker-unreachable"
          className={cn(
            "flex items-center gap-2 border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-900 duration-200 animate-in fade-in slide-in-from-top-1 dark:text-red-200 motion-reduce:animate-none",
            embedded ? "rounded-lg border" : "border-b",
          )}
        >
          <CloudOff className="size-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <p className="flex-1">
            <Trans>
              Your sharing service isn't answering, so this is what this computer remembers:
              sizes and comment counts are missing, and a book shared from another computer
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
          "flex min-h-0 flex-1 flex-col gap-4",
          embedded ? "p-0" : "overflow-auto p-6",
        )}
      >
        <PublicationsSummary totals={data.totals} countsKnown={countsKnown} />

        {nothingPublished ? (
          <div
            data-testid="publications-empty"
            className="flex min-h-64 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-6 py-12 text-center"
          >
            <Globe className="size-5 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              <Trans>No shared books yet</Trans>
            </p>
            <p className="max-w-md text-xs leading-5 text-muted-foreground">
              <Trans>
                Open a book and go to Sharing. You'll get a link to send to readers, and
                everything they comment on comes back here.
              </Trans>
            </p>
          </div>
        ) : (
          <>
            <HostUpdatesBanner
              labels={data.publications.filter((p) => p.host_update_available).map((p) => p.book_label)}
              updates={hostUpdates}
            />

            <PublicationsToolbar query={query} onQuery={setQuery} />

            {publications.length === 0 ? (
              <FilteredEmptyState
                icon={query.search.trim().length > 0 ? Search : MessagesSquare}
                title={
                  query.search.trim().length > 0 ? (
                    <Trans>No shared book matches “{query.search}”.</Trans>
                  ) : (
                    <Trans>Nothing is waiting for you — every thread is resolved.</Trans>
                  )
                }
                onClear={() => setQuery(EMPTY_QUERY)}
              />
            ) : (
              <ul
                role="list"
                className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]"
              >
                {publications.map((publication, index) => (
                  <PublicationCard
                    key={publication.token}
                    publication={publication}
                    countsKnown={countsKnown}
                    index={index}
                    busy={busyLabel === publication.book_label}
                    deleting={remove.isPending && remove.variables?.token === publication.token}
                    onStop={() => stop.mutate(publication.book_label)}
                    onResume={() => resume.mutate(publication.book_label)}
                    onDelete={() => setPendingDelete(publication)}
                    hostUpdate={hostUpdates.stateOf(publication.book_label)}
                    onUpdateHost={() => hostUpdates.update([publication.book_label])}
                    deleteError={
                      remove.isError && remove.variables?.token === publication.token
                        ? remove.error
                        : null
                    }
                  />
                ))}
              </ul>
            )}

            {/* Deleting reports itself on the card that failed; stopping and resuming are
                fast enough to answer here. */}
            {stop.isError || resume.isError ? (
              <p
                data-testid="publications-action-error"
                role="alert"
                className="flex items-start gap-2 text-xs leading-5 text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {(stop.error ?? resume.error)?.message}
              </p>
            ) : null}
          </>
        )}

        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
        >
          <AlertDialogContent data-testid="publication-delete-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans>Delete “{pendingDelete?.title}” permanently?</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans>
                  This removes the site and every shared version from your Cloudflare account.
                  The book on this computer is untouched, and the link stops working for everyone.
                </Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans>Keep sharing</Trans>
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  if (!pendingDelete) return
                  remove.mutate({
                    token: pendingDelete.token,
                    label: pendingDelete.book_label,
                  })
                  setPendingDelete(null)
                }}
              >
                <Trans>Delete permanently</Trans>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
