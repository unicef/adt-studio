import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { History, KeyRound, MessagesSquare, Unlock, Users, type LucideIcon } from "lucide-react"
import type { BookPublicationRecord } from "@/api/client"
import { usePublicationReaders } from "@/hooks/use-publications"
import { useFeedbackBadge } from "@/components/publication-feedback/use-feedback-badge"
import { formatPublishDate } from "@/components/pipeline/stages/publish/expiry-options"
import { cn } from "@/lib/utils"

/** One colour per tile, so the four are told apart at a glance rather than read. The tint is
 *  carried by the icon chip only: four coloured cards would compete with the page. */
const TONE = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
} as const

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  loading = false,
}: {
  icon: LucideIcon
  tone: keyof typeof TONE
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  loading?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
          TONE[tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {loading ? (
          <span
            aria-hidden="true"
            className="my-1 h-4 w-10 animate-pulse rounded bg-muted motion-reduce:animate-none"
          />
        ) : (
          <span className="truncate text-lg font-semibold leading-tight tabular-nums text-foreground">
            {value}
          </span>
        )}
        {hint ? (
          <span className="truncate text-[11px] leading-4 text-muted-foreground">{hint}</span>
        ) : null}
      </span>
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
 * The four numbers worth knowing at a glance.
 *
 * Deliberately not charts: these are small integers and a date, and a reader count is not a
 * trend. Each tile is the answer to a question the author would otherwise go looking for, so
 * each one reserves its height and shows a pulse while its number is still in flight — a tile
 * that shows a dash and then a 7 reads as a number that changed.
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

  return (
    <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        icon={History}
        tone="indigo"
        label={<Trans>Live version</Trans>}
        value={currentVersion === null ? "—" : `v${currentVersion}`}
        hint={
          newest ? (
            <Trans>of {versions.length} published</Trans>
          ) : (
            <Trans>Nothing published yet</Trans>
          )
        }
      />
      <Tile
        icon={Users}
        tone="violet"
        label={<Trans>Readers joined</Trans>}
        value={readers.data?.readers.length ?? 0}
        loading={token !== null && readers.isPending}
        hint={<Trans>Gave a name</Trans>}
      />
      <Tile
        icon={MessagesSquare}
        tone="amber"
        label={<Trans>Open feedback</Trans>}
        value={feedback.unresolvedCount}
        loading={!feedback.loaded}
        hint={<Trans>Waiting on you</Trans>}
      />
      <Tile
        icon={hasAccessCode ? KeyRound : Unlock}
        tone="emerald"
        label={<Trans>Access</Trans>}
        value={
          hasAccessCode ? (
            <span className="font-mono tracking-wider">
              {record?.access_code ?? <Trans>Code</Trans>}
            </span>
          ) : (
            <Trans>Open</Trans>
          )
        }
        hint={
          record?.expires_at ? (
            <Trans>Ends {formatPublishDate(record.expires_at, i18n.locale)}</Trans>
          ) : (
            <Trans>No end date</Trans>
          )
        }
      />
    </div>
  )
}
