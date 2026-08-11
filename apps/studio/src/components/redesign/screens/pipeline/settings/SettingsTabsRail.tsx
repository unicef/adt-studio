import { Trans, useLingui } from "@lingui/react/macro"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDirtyTabsForStage } from "@/hooks/use-settings-dirty-tabs"
import { cn } from "@/lib/utils"
import { tint } from "../plugins"
import type { StepSettingsSlug, StepSettingsTab } from "./slugs"

export interface SettingsTabsRailProps {
  slug: StepSettingsSlug
  hex: string
  tabs: StepSettingsTab[]
  activeTab: string
  onSelect: (tab: string) => void
}

export function SettingsTabsRail({ slug, hex, tabs, activeTab, onSelect }: SettingsTabsRailProps) {
  const { t } = useLingui()
  const dirtyTabs = useDirtyTabsForStage(slug)

  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Trans>Settings</Trans>
      </span>

      <ScrollArea className="-mx-1 min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 px-1">
          {tabs.map((tab) => {
            const active = tab.key === activeTab
            const dirty = dirtyTabs.has(tab.key)
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelect(tab.key)}
                aria-current={active ? "true" : undefined}
                aria-label={dirty ? t`${tab.label} (unsaved changes)` : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[11px] transition-colors",
                  active ? "font-semibold" : "text-muted-foreground hover:bg-muted",
                )}
                style={active ? { background: tint(hex, 0.12), color: hex } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                {dirty && (
                  <span
                    aria-hidden
                    className={cn("size-1.5 shrink-0 rounded-full", !active && "bg-amber-500")}
                    style={active ? { background: hex } : undefined}
                  />
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <Trans>Changes apply to this book only. Re-run the step to use them.</Trans>
      </div>
    </>
  )
}
