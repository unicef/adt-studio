import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { StatusDot } from "../StatusDot"
import type { RailEntry } from "../ui"

const RAIL_SELECTED = cn("bg-[color-mix(in_oklab,var(--rail)_80%,black)] text-white dark:bg-[color-mix(in_oklab,var(--rail)_85%,black)]")

export function RailRow({
  entry,
  active,
  hex,
  tabIndex,
  onSelect,
}: {
  entry: RailEntry
  active: boolean
  hex: string
  tabIndex?: number
  onSelect: () => void
}) {
  const { t } = useLingui()
  const thumb = entry.thumb
  const overview = !entry.key
  return (
    <button
      type="button"
      data-rail-row=""
      tabIndex={tabIndex}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      data-rail-select={active ? "solid" : undefined}
      style={{ ["--rail" as string]: hex }}
      className={cn(
        "flex w-full gap-2.5 rounded-[9px] p-2 text-left transition-[background-color,color] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--rail)_55%,transparent)] motion-reduce:transition-none",
        overview && "items-center py-1.5",
        active ? RAIL_SELECTED : "hover:bg-muted",
      )}
    >
      {thumb && <span className="relative shrink-0">{thumb}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          {entry.failed && <StatusDot tone="failed" label={t`Has failures`} />}
          <span className={cn("min-w-0 flex-1 truncate text-xs font-semibold", !active && "text-foreground")}>{entry.title}</span>
          {entry.meta && <span className={cn("flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums", active ? "text-white/80" : "text-muted-foreground")}>{entry.meta}</span>}
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-4 tabular-nums",
              active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {entry.count}
          </span>
        </span>
        {!overview && (entry.subtitle || entry.searchText || entry.emptySubtitle !== null) && (
          <span className={cn("line-clamp-2 text-[11px] leading-snug", active ? "text-white/80" : "text-muted-foreground")}>
            {entry.subtitle || entry.searchText?.replace(/\n/g, " ") || entry.emptySubtitle || t`No text`}
          </span>
        )}
      </span>
    </button>
  )
}
