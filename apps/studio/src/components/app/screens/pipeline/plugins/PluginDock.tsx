import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { StageGroup } from "@/components/pipeline/stage-config"
import {
  getStageLabelI18n,
  getStageDescriptionI18n,
  getStageGroupLabelI18n,
} from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import {
  groupDockEntries,
  stageDependsOn,
  tint,
} from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface PluginDockProps {
  foundations: DockItem[]
  plugins: DockItem[]
  activeSlug?: string | null
  onOpenPlugin: (slug: string) => void
  /** Shown above the dock while plugins are still locked. */
  hint?: React.ReactNode
  /** Collapses the dock to its handle. Omitted on screens with no minimized mode. */
  onMinimize?: () => void
  /** Slides the dock off the bottom edge. It stays mounted so both directions animate. */
  minimized?: boolean
}

/**
 * Uppercase caption above each cluster of discs. `leading-none` pins its height
 * to the font size, so the trailing controls can reserve the same height with a
 * blank spacer and stay level with the discs.
 */
const GROUP_LABEL_CLASS =
  "text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground/65 whitespace-nowrap"
const GROUP_LABEL_HEIGHT = "h-2"

function DockDisc({
  item,
  active,
  linked,
  onClick,
}: {
  item: DockItem
  active: boolean
  /** Draw the connector back to the disc on the left — this stage consumes its output. */
  linked: boolean
  onClick: () => void
}) {
  const { t } = useLingui()
  const locked = item.state === "locked"
  const name = getStageLabelI18n(item.slug)
  const blockedHint = item.lockedBy
    ? t`Run ${getStageLabelI18n(item.lockedBy)} first`
    : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      title={blockedHint ?? getStageDescriptionI18n(item.slug) ?? name}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-[62px] flex-col items-center gap-1 cursor-pointer px-1 py-2 border border-transparent hover:bg-black/5 focus:border-border",
      )}
    >
      {linked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[18px] top-[24px] h-0.5 w-8 bg-border"
        />
      )}
      <span
        className="grid size-[34px] place-items-center rounded-full text-white transition-shadow"
        style={{
          background: locked ? "var(--border)" : item.hex,
          color: locked ? "var(--muted-foreground)" : undefined,
          boxShadow: active ? `0 0 0 3px ${tint(item.hex, 0.55)}` : undefined,
        }}
      >
        <item.icon className="size-[17px]" strokeWidth={2.4} />
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[10px] leading-tight",
          active ? "font-semibold" : "text-muted-foreground",
        )}
        style={active ? { color: item.hex } : undefined}
      >
        {name}
      </span>
      {item.state === "done" && item.pending === 0 && (
        <span className="absolute right-2 top-1 grid size-4 place-items-center rounded-full border-[1.5px] border-card bg-emerald-500 text-white">
          <Check className="size-2" strokeWidth={4} />
        </span>
      )}
      {item.pending > 0 && (
        <span
          className="absolute right-1 top-0 rounded-full px-1.5 text-[9px] font-semibold text-white"
          style={{ background: item.hex }}
        >
          {item.pending}
        </span>
      )}
    </button>
  )
}

const STACK_PREVIEW = 3

const PILL_LAYER =
  "absolute inset-y-0 left-0 flex w-max items-center rounded-xl border bg-accent transition-opacity duration-200 ease-out motion-reduce:transition-none"
const PILL_LAYER_HIDDEN = "pointer-events-none opacity-0"

function GroupPill({
  label,
  items,
  open,
  activeSlug,
  onOpenPlugin,
  onExpand,
}: {
  label: string
  items: DockItem[]
  open: boolean
  activeSlug?: string | null
  onOpenPlugin: (slug: string) => void
  onExpand: () => void
}) {
  const { t } = useLingui()
  const discsRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLButtonElement>(null)
  const [width, setWidth] = useState<number>()

  useLayoutEffect(() => {
    const node = open ? discsRef.current : stackRef.current
    if (node) setWidth(node.offsetWidth)
  }, [open, items.length])

  const preview = items.slice(0, STACK_PREVIEW)
  const rest = items.length - preview.length

  return (
    <div
      className={cn(
        "relative flex-1 overflow-hidden rounded-xl",
        width != null &&
          "transition-[width] duration-300 ease-out motion-reduce:transition-none",
      )}
      style={{ width }}
    >
      <div
        ref={discsRef}
        inert={!open}
        className={cn(PILL_LAYER, "gap-1", !open && PILL_LAYER_HIDDEN)}
      >
        {items.map((item, index) => (
          <DockDisc
            key={item.slug}
            item={item}
            active={activeSlug === item.slug}
            linked={index > 0 && stageDependsOn(item.slug, items[index - 1].slug)}
            onClick={() => onOpenPlugin(item.slug)}
          />
        ))}
      </div>

      <button
        ref={stackRef}
        type="button"
        onClick={onExpand}
        title={t`Show ${label}`}
        aria-expanded={open}
        inert={open}
        className={cn(
          PILL_LAYER,
          "cursor-pointer px-2.5 hover:bg-black/5",
          open && PILL_LAYER_HIDDEN,
        )}
      >
        {preview.map((item, index) => (
          <span
            key={item.slug}
            className={cn(
              "grid size-[38px] place-items-center rounded-full border-2 border-card text-white",
              index > 0 && "-ml-4",
            )}
            style={{
              background: item.state === "locked" ? "var(--border)" : item.hex,
              color: item.state === "locked" ? "var(--muted-foreground)" : undefined,
            }}
          >
            <item.icon className="size-[17px]" strokeWidth={2.4} />
          </span>
        ))}
        {rest > 0 && (
          <span className="-ml-4 grid size-[38px] place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
            {`+${rest}`}
          </span>
        )}
      </button>
    </div>
  )
}

export function PluginDock({
  foundations,
  plugins,
  activeSlug,
  onOpenPlugin,
  hint,
  onMinimize,
  minimized,
}: PluginDockProps) {
  const { t } = useLingui()
  const groups = useMemo(
    () => groupDockEntries([...foundations, ...plugins]),
    [foundations, plugins],
  )
  const activeGroup = activeSlug
    ? groups.find((group) => group.items.some((item) => item.slug === activeSlug))?.key
    : undefined
  const [expandedGroup, setExpandedGroup] = useState<StageGroup | undefined>(activeGroup)
  useEffect(() => {
    if (activeGroup) setExpandedGroup(activeGroup)
  }, [activeGroup])
  const openGroup = expandedGroup ?? groups[0]?.key

  return (
    <div
      inert={minimized}
      aria-hidden={minimized}
      className={cn(
        "fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
        minimized
          ? "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0"
          : "translate-y-0 opacity-100",
      )}
    >
      {hint && (
        <div className="rounded-full border bg-card px-3 py-1 text-[10.5px] text-muted-foreground">
          {hint}
        </div>
      )}
      <div className="flex items-stretch gap-2.5 rounded-2xl border bg-card/92 p-2 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md">
        {groups.map((group) => {
          const label = getStageGroupLabelI18n(group.key)
          return (
            <div key={group.key} className="flex flex-col items-center gap-1">
              <span className={GROUP_LABEL_CLASS}>{label}</span>
              <GroupPill
                label={label}
                items={group.items}
                open={group.key === openGroup}
                activeSlug={activeSlug}
                onOpenPlugin={onOpenPlugin}
                onExpand={() => setExpandedGroup(group.key)}
              />
            </div>
          )
        })}

        <div className="flex flex-col items-center gap-1">
          <span aria-hidden className={GROUP_LABEL_HEIGHT} />
          <div className="flex flex-1 items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-[62px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-muted"
                >
                  <span className="grid size-[34px] place-items-center rounded-full bg-muted text-muted-foreground">
                    <Plus className="size-[18px]" />
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    <Trans>Plugins</Trans>
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-[300px] p-1.5">
                <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  <Trans>All plugins</Trans>
                </div>
                {plugins.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => onOpenPlugin(item.slug)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted",
                      item.state === "locked" && "opacity-55",
                    )}
                  >
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: item.hex }}
                    >
                      <item.icon className="size-3.5" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold">
                          {getStageLabelI18n(item.slug)}
                        </span>
                        {item.state === "done" && (
                          <span className="text-[10px] font-medium text-emerald-600">
                            <Trans>done</Trans>
                          </span>
                        )}
                        {item.state === "locked" && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {item.lockedBy
                              ? t`needs ${getStageLabelI18n(item.lockedBy)}`
                              : t`locked`}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {getStageDescriptionI18n(item.slug) ?? t`No description available.`}
                      </span>
                    </span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={t`Minimize the dock`}
                aria-label={t`Minimize the dock`}
                className="bg-background border border-border absolute -top-4 -left-4 grid size-9  place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className="size-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
