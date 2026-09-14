import type { ReactNode } from "react"
import { HardDrive, Globe, MessagesSquare, Radio } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { R2_FREE_TIER_BYTES, type PublicationsTotals } from "@adt/types"
import { cn } from "@/lib/utils"
import { formatStorage, freeTierFraction } from "./format"

function Tile({
  icon,
  label,
  value,
  hint,
  children,
}: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 mh:p-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums leading-tight mh:text-xl">{value}</span>
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
      {children}
    </div>
  )
}

export function PublicationsSummary({
  totals,
  countsKnown,
}: {
  /** `false` while the worker is unreachable: the storage and comment numbers are then
   *  unmeasured, and a tile that showed `0` would be making a claim the Studio cannot back. */
  countsKnown: boolean
  totals: PublicationsTotals
}) {
  const { t, i18n } = useLingui()
  const unknown = t`—`
  const stopped = totals.published_count - totals.active_count
  const storage = formatStorage(totals.total_snapshot_bytes, i18n.locale)
  const allowance = formatStorage(R2_FREE_TIER_BYTES, i18n.locale)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<Globe className="size-3.5" aria-hidden="true" />}
          label={<Trans>Published books</Trans>}
          value={totals.published_count}
        />
        <Tile
          icon={<Radio className="size-3.5" aria-hidden="true" />}
          label={<Trans>Open to readers</Trans>}
          value={totals.active_count}
          hint={
            stopped > 0 ? (
              <Trans>{stopped} stopped or expired</Trans>
            ) : (
              <Trans>Every link is live</Trans>
            )
          }
        />
        <Tile
          icon={<HardDrive className="size-3.5" aria-hidden="true" />}
          label={<Trans>Storage used</Trans>}
          value={
            countsKnown ? (
              totals.snapshot_bytes_complete ? (
                storage
              ) : (
                <Trans>at least {storage}</Trans>
              )
            ) : (
              <span className="text-muted-foreground">{unknown}</span>
            )
          }
          hint={countsKnown ? <Trans>of {allowance} free in R2</Trans> : undefined}
        >
          {countsKnown ? (
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${freeTierFraction(totals.total_snapshot_bytes) * 100}%` }}
              />
            </div>
          ) : null}
        </Tile>
        <Tile
          icon={<MessagesSquare className="size-3.5" aria-hidden="true" />}
          label={<Trans>Comments to read</Trans>}
          value={
            countsKnown ? (
              totals.total_unresolved
            ) : (
              <span className="text-muted-foreground">{unknown}</span>
            )
          }
          hint={
            countsKnown && totals.total_unresolved === 0 ? (
              <Trans>Nothing open</Trans>
            ) : undefined
          }
        />
      </div>
      <p className={cn("text-xs leading-5 text-muted-foreground", "mh:leading-4")}>
        <Trans>
          Storage is the size of every published version's files in your own Cloudflare R2
          bucket, measured while uploading them — earlier versions keep their files, so updating
          a book adds to this. How many people opened your links is not shown here: reading that
          needs Cloudflare analytics permissions the Studio never asks for.
        </Trans>
      </p>
    </div>
  )
}
