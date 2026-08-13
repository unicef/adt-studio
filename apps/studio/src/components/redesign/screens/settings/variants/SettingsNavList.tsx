import { Link } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SETTINGS_PATHS, type SettingsGroupConfig, type SettingsSection } from "../nav"

interface SettingsNavListProps {
  groups: SettingsGroupConfig[]
  activeKey: SettingsSection
  tone?: "raised" | "flat"
  className?: string
}

export function SettingsNavList({
  groups,
  activeKey,
  tone = "raised",
  className,
}: SettingsNavListProps) {
  const { i18n } = useLingui()

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          {group.label && (
            <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {i18n._(group.label)}
            </div>
          )}
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
                    ? tone === "raised"
                      ? "bg-card font-semibold text-brand-700 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.05)]"
                      : "bg-muted font-semibold text-brand-700"
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
