import { useLingui } from "@lingui/react/macro"
import { PanelRightClose, Sparkles, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PanelTab } from "@/components/app/screens/pipeline/shared/workspacePrefs"

export interface PanelTabsProps {
  value: PanelTab
  onChange: (tab: PanelTab) => void
  onCollapse: () => void
  stylesDisabled: boolean
}

export function PanelTabs({ value, onChange, onCollapse, stylesDisabled }: PanelTabsProps) {
  const { t } = useLingui()

  const tabs: Array<{ id: PanelTab; label: string; icon: typeof Sparkles; disabled: boolean; hint?: string }> = [
    {
      id: "styles",
      label: t`Styles`,
      icon: SlidersHorizontal,
      disabled: stylesDisabled,
      hint: t`Open a rendered page to style it`,
    },
    { id: "ai", label: t`AI`, icon: Sparkles, disabled: false },
  ]

  return (
    <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-2.5">
      <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {tabs.map(({ id, label, icon: Icon, disabled, hint }) => {
          const active = id === value && !disabled
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              title={disabled ? hint : label}
              onClick={() => onChange(id)}
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-1.5 text-[11.5px] font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground enabled:hover:bg-background/70 enabled:hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onCollapse}
        title={t`Hide the panel`}
        aria-label={t`Hide the panel`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <PanelRightClose className="size-3.5" />
      </button>
    </div>
  )
}
