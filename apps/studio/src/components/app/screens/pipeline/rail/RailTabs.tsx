import { useLingui } from "@lingui/react/macro"
import { Blocks, Files, ListTree } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RailTab } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { RailCollapseButton } from "./SideRail"

export interface RailTabsProps {
  value: RailTab
  onChange: (tab: RailTab) => void
  editable: boolean
}

export function RailTabs({ value, onChange, editable }: RailTabsProps) {
  const { t } = useLingui()

  const tabs: Array<{
    id: RailTab
    label: string
    icon: typeof Files
    disabled: boolean
    hint?: string
  }> = [
    { id: "pages", label: t`Pages`, icon: Files, disabled: false },
    {
      id: "layers",
      label: t`Layers`,
      icon: ListTree,
      disabled: !editable,
      hint: t`Open a rendered page to see its elements`,
    },
    {
      id: "palette",
      label: t`Blocks`,
      icon: Blocks,
      disabled: !editable,
      hint: t`Open a rendered page to add blocks`,
    },
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
      <RailCollapseButton />
    </div>
  )
}
