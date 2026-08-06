import { AlertTriangle, ArrowUpCircle, Loader2, UserRound } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PublicationReader } from "@adt/types"
import { apiErrorCode } from "@/api/client"
import { PublishingSettingsLink } from "@/components/pipeline/stages/export/publish/PublishingSettingsLink"
import { formatPublishDate } from "@/components/pipeline/stages/export/publish/expiry-options"
import { usePublicationReaders } from "@/hooks/use-publications"

function Initial({ reader }: { reader: PublicationReader }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: reader.color }}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase text-white"
    >
      {[...reader.name][0] ?? "?"}
    </span>
  )
}

function ReaderLine({ reader }: { reader: PublicationReader }) {
  const { i18n } = useLingui()

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <Initial reader={reader} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{reader.name}</span>
        <span className="text-[11px] text-muted-foreground">
          <Trans>Joined {formatPublishDate(reader.joined_at, i18n.locale)}</Trans>
        </span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {reader.comment_count === 0 ? (
          <Trans>No comments</Trans>
        ) : (
          <Trans>
            {reader.comment_count} comments · last{" "}
            {formatPublishDate(reader.last_comment_at ?? reader.joined_at, i18n.locale)}
          </Trans>
        )}
      </span>
    </li>
  )
}

interface PublicationReadersProps {
  token: string
  /** Supplied instead of fetching — the demo shelf's only hook into this panel. */
  override?: readonly PublicationReader[]
}

/**
 * The roster of one publication.
 *
 * The wording is deliberately "joined", never "visited": the worker only ever records somebody
 * who typed a name — at the access-code gate, or in the composer before their first comment —
 * so a reader who opened an un-coded link and never wrote is not on this list and never was.
 * Saying otherwise would be inventing an audience.
 */
export function PublicationReaders({ token, override }: PublicationReadersProps) {
  const query = usePublicationReaders(token, override === undefined)
  const readers = override ?? query.data?.readers
  const outdated = apiErrorCode(query.error) === "worker_outdated"

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        <Trans>Readers who joined</Trans>
      </span>

      {readers === undefined && query.isPending ? (
        <span className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Trans>Looking up who has joined…</Trans>
        </span>
      ) : outdated ? (
        <div
          data-testid="publication-readers-outdated"
          className="flex flex-col items-start gap-2 py-2"
        >
          <span className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ArrowUpCircle className="mt-0.5 size-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
            <Trans>
              Your publishing service is a version behind and doesn't keep this list yet.
              Installing the update adds it — the names of anyone who joined before then are
              already stored, so nothing has been lost.
            </Trans>
          </span>
          <PublishingSettingsLink variant="outline" size="sm" className="h-7 text-xs">
            <Trans>Install the update</Trans>
          </PublishingSettingsLink>
        </div>
      ) : readers === undefined ? (
        <span className="flex items-start gap-2 py-2 text-xs leading-5 text-amber-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {query.error?.message ?? (
            <Trans>We couldn't reach your publishing service for this list.</Trans>
          )}
        </span>
      ) : readers.length === 0 ? (
        <span className="flex items-start gap-2 py-2 text-xs leading-5 text-muted-foreground">
          <UserRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <Trans>
            Nobody has given a name yet. Readers appear here the moment they sign in at the
            access code or write their first comment.
          </Trans>
        </span>
      ) : (
        <>
          <ul className="flex list-none flex-col divide-y p-0">
            {readers.map((reader) => (
              <ReaderLine key={reader.id} reader={reader} />
            ))}
          </ul>
          <p className="pt-1 text-[11px] leading-4 text-muted-foreground">
            <Trans>
              Only people who typed a name are listed — somebody can read the book without
              appearing here.
            </Trans>
          </p>
        </>
      )}
    </div>
  )
}
