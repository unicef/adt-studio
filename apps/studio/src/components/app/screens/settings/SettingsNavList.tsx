import { Link } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { useSharingUpdate } from "@/hooks/use-sharing-update"
import { SETTINGS_GROUPS, SETTINGS_PATHS, type SettingsSection } from "./nav"

interface SettingsNavListProps {
  activeKey: SettingsSection
  className?: string
}

export function SettingsNavList({ activeKey, className }: SettingsNavListProps) {
  const { i18n, t } = useLingui()
  /** The tab that has something waiting says so, the same way the app sidebar's Settings does —
   *  otherwise the dot that brought the author here stops pointing anywhere once they arrive. */
  const pending: Partial<Record<SettingsSection, boolean>> = { publishing: useSharingUpdate() !== null }

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
                {pending[tab.key] ? (
                  <span className="flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
                    <span aria-hidden className="size-1.5 rounded-full bg-brand-600" />
                    {t`Update`}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}
