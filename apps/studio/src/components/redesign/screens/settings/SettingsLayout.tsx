import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { TopBar } from "@/components/title-bar/TopBar"
import { cn } from "@/lib/utils"
import { SETTINGS_PATHS, SETTINGS_TABS, activeSettingsTab } from "./nav"

export function SettingsLayout() {
  const { i18n } = useLingui()
  const { pathname } = useLocation()
  const activeTab = activeSettingsTab(pathname)
  const active = activeTab.key
  const fullWidth = activeTab.fullWidth === true

  return (
    <div className="relative flex h-full flex-col bg-background pt-8">

      <TopBar className="absolute top-0 drag-region" />

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          fullWidth ? "overflow-hidden" : "overflow-auto",
        )}
      >
      <div className="shrink-0 px-[34px] text-[22px] font-bold tracking-[-0.02em]">
        <Trans>Settings</Trans>
      </div>
      <div className="sticky top-0 z-[2] mt-3.5 shrink-0 border-b bg-background px-[34px]">
        <nav className="flex justify-start gap-6">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon
            const sel = active === tab.key
            return (
              <Link
                key={tab.key}
                to={SETTINGS_PATHS[tab.key]}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-0.5 py-[15px] text-[13.5px] font-medium transition-colors",
                  sel
                    ? "border-brand-600 font-semibold text-brand-700"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {i18n._(tab.label)}
              </Link>
            )
          })}
        </nav>
      </div>
      <div
        className={cn(
          "px-[34px]",
          fullWidth
            ? "flex min-h-0 flex-1 flex-col pb-6 pt-[22px]"
            : "max-w-[820px] pb-10 pt-[26px]",
        )}
      >
        <Outlet />
      </div>
      </div>
    </div>
  )
}
