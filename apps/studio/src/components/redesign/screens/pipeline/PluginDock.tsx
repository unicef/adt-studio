import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getStageLabelI18n, getStageDescriptionI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { tint } from "./plugins"
import type { DockItem } from "./usePipelineState"

export interface PluginDockProps {
  foundations: DockItem[]
  plugins: DockItem[]
  activeSlug?: string | null
  onOpenPlugin: (slug: string) => void
  /** Shown above the dock while plugins are still locked. */
  hint?: React.ReactNode
}

function DockDisc({
  item,
  active,
  onClick,
}: {
  item: DockItem
  active: boolean
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
        "relative flex w-[62px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-muted",
      )}
    >
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
          "w-full truncate text-center text-[9px] leading-tight",
          active ? "font-semibold" : "text-muted-foreground",
        )}
        style={active ? { color: item.hex } : undefined}
      >
        {name}
      </span>
      {item.state === "done" && item.pending === 0 && (
        <span className="absolute right-2 top-0 grid size-3 place-items-center rounded-full border-[1.5px] border-card bg-emerald-500 text-white">
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

/**
 * Floating dock of pipeline stages: foundations, then plugins, then the plugin
 * catalog. It owns its own placement — fixed to the window, centred — so the
 * dock lands in exactly the same spot on every screen that renders it, whatever
 * rails happen to sit beside it.
 */
export function PluginDock({
  foundations,
  plugins,
  activeSlug,
  onOpenPlugin,
  hint,
}: PluginDockProps) {
  const { t } = useLingui()

  return (
    <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      {hint && (
        <div className="rounded-full border bg-card px-3 py-1 text-[10.5px] text-muted-foreground">
          {hint}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-2xl border bg-card/92 p-2 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md">
        {foundations.map((item) => (
          <DockDisc
            key={item.slug}
            item={item}
            active={activeSlug === item.slug}
            onClick={() => onOpenPlugin(item.slug)}
          />
        ))}

        <div className="mx-1 h-9 w-px bg-border" />

        {plugins.map((item) => (
          <DockDisc
            key={item.slug}
            item={item}
            active={activeSlug === item.slug}
            onClick={() => onOpenPlugin(item.slug)}
          />
        ))}

        <div className="mx-1 h-9 w-px bg-border" />

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
      </div>
    </div>
  )
}
