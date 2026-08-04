import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SETTINGS_PATHS, SETTINGS_TABS, activeSettingsSection } from "./nav"

export function SettingsLayout() {
  const { i18n } = useLingui()
  const { pathname } = useLocation()
  const active = activeSettingsSection(pathname)

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="px-[34px] pt-6 text-[22px] font-bold tracking-[-0.02em]">
        <Trans>Settings</Trans>
      </div>
      <div className="sticky top-0 z-[2] mt-3.5 border-b bg-background px-[34px]">
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
      <div className="max-w-[820px] px-[34px] pb-10 pt-[26px]">
        <Outlet />
      </div>
    </div>
  )
}
