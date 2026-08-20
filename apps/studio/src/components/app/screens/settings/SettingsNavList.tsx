import { Link } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SETTINGS_GROUPS, SETTINGS_PATHS, type SettingsSection } from "./nav"

interface SettingsNavListProps {
  activeKey: SettingsSection
  className?: string
}

export function SettingsNavList({ activeKey, className }: SettingsNavListProps) {
  const { i18n } = useLingui()

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            {i18n._(group.label)}
          </div>
          {group.tabs.map((tab) => {
            const Icon = tab.icon
            const active = activeKey === tab.key
            return (
              <Link
                key={tab.key}
                to={SETTINGS_PATHS[tab.key]}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-card font-semibold text-brand-700 ring-1 ring-border shadow-sm"
                    : "text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                )}
              >
                <Icon className="size-[17px]" />
                <span className="flex-1 truncate text-left">{i18n._(tab.label)}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}
