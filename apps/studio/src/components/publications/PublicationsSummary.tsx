import type { CSSProperties, ReactNode } from "react"
import { HardDrive, Globe, Info, MessagesSquare, Radio } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PublicationsTotals } from "@adt/types"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { formatStorage } from "./format"

function Tile({
  icon,
  label,
  value,
  hint,
  aside,
  index,
}: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  aside?: ReactNode
  index: number
}) {
  return (
    <div
      style={{ "--d": `${index * 50}ms` } as CSSProperties}
      className="flex flex-col gap-0.5 rounded-xl border bg-card p-3.5 [animation-delay:var(--d)] [animation-fill-mode:both] motion-safe:animate-wizard-enter"
    >
      <span className="flex h-5 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
        {aside}
      </span>
      <span className="text-xl font-semibold tabular-nums leading-tight">{value}</span>
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
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

  /** What "storage" measures, and what this shelf deliberately never shows. It used to sit under
   *  the tiles as two lines of running text on every visit; a note this size belongs behind the
   *  tile it qualifies. The copy stays in the DOM for screen readers — the hover card is the
   *  same sentence for people who can see the icon. */
  const storageNote = (
    <Trans>
      Storage is the size of every published version's files in Cloudflare Static Assets.
      Earlier versions keep their files, so updating a book adds to this. How many people
      opened your links is not shown here: reading that needs Cloudflare analytics permissions
      the Studio never asks for.
    </Trans>
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        index={0}
        icon={<Globe className="size-3.5" aria-hidden="true" />}
        label={<Trans>Published books</Trans>}
        value={totals.published_count}
        hint={<Trans>Room for {Math.max(0, 99 - totals.published_count)} more</Trans>}
      />
      <Tile
        index={1}
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
        index={2}
        icon={<HardDrive className="size-3.5" aria-hidden="true" />}
        label={<Trans>Storage used</Trans>}
        aside={
          <HoverCard openDelay={150} closeDelay={80}>
            <HoverCardTrigger asChild>
              <span
                tabIndex={-1}
                aria-hidden="true"
                className="ml-auto inline-flex size-5 cursor-help items-center justify-center rounded-full text-muted-foreground/60 transition-colors duration-200 hover:bg-accent hover:text-foreground motion-reduce:transition-none"
              >
                <Info className="size-3.5" />
              </span>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-80 p-3.5 text-xs font-normal normal-case leading-5 tracking-normal text-muted-foreground">
              {storageNote}
            </HoverCardContent>
          </HoverCard>
        }
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
        hint={countsKnown ? <Trans>Across all published versions</Trans> : undefined}
      />
      <Tile
        index={3}
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
      <p className="sr-only">{storageNote}</p>
    </div>
  )
}
