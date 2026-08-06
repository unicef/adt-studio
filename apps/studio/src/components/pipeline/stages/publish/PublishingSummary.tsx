import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { History, KeyRound, MessagesSquare, Users } from "lucide-react"
import type { BookPublicationRecord } from "@/api/client"
import { usePublicationReaders } from "@/hooks/use-publications"
import { useFeedbackBadge } from "@/components/pipeline/stages/feedback/use-feedback-badge"
import { formatPublishDate } from "@/components/pipeline/stages/export/publish/expiry-options"

function Tile({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold leading-tight tabular-nums">{value}</span>
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

interface PublishingSummaryProps {
  bookLabel: string
  record: BookPublicationRecord | null
  currentVersion: number | null
  hasAccessCode: boolean
}

/**
 * The four numbers worth knowing at a glance once a book is live.
 *
 * Deliberately not a chart: the useful facts here are small integers and a date, and a reader
 * count is not a trend. Each tile is also the answer to a question the author would otherwise
 * open a tab to ask.
 */
export function PublishingSummary({
  bookLabel,
  record,
  currentVersion,
  hasAccessCode,
}: PublishingSummaryProps) {
  const { i18n } = useLingui()
  const token = record?.token ?? null
  const readers = usePublicationReaders(token ?? "", token !== null)
  const feedback = useFeedbackBadge(bookLabel)

  const versions = record?.versions ?? []
  const newest = [...versions].sort((a, b) => b.version - a.version)[0] ?? null
  const unknown = "—"

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        icon={<History className="size-3.5" aria-hidden="true" />}
        label={<Trans>Live version</Trans>}
        value={currentVersion === null ? unknown : `v${currentVersion}`}
        hint={
          newest ? (
            <Trans>Published {formatPublishDate(newest.published_at, i18n.locale)}</Trans>
          ) : undefined
        }
      />
      <Tile
        icon={<Users className="size-3.5" aria-hidden="true" />}
        label={<Trans>Readers joined</Trans>}
        value={readers.data ? readers.data.readers.length : unknown}
        hint={<Trans>People who gave a name</Trans>}
      />
      <Tile
        icon={<MessagesSquare className="size-3.5" aria-hidden="true" />}
        label={<Trans>Open feedback</Trans>}
        value={feedback.loaded ? feedback.unresolvedCount : unknown}
        hint={<Trans>Threads still waiting on you</Trans>}
      />
      <Tile
        icon={<KeyRound className="size-3.5" aria-hidden="true" />}
        label={<Trans>Access</Trans>}
        value={
          hasAccessCode ? (
            <span className="font-mono text-xl tracking-wider">
              {record?.access_code ?? <Trans>Code</Trans>}
            </span>
          ) : (
            <Trans>Open</Trans>
          )
        }
        hint={
          hasAccessCode ? (
            <Trans>Readers type this to get in</Trans>
          ) : (
            <Trans>Anyone with the link can open it</Trans>
          )
        }
      />
    </div>
  )
}
