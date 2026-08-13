import { useLocation } from "@tanstack/react-router"
import { TopBar } from "@/components/title-bar/TopBar"
import { SettingsSidebar } from "./SettingsSidebar"
import { activeSettingsTab } from "./nav"
import { useSettingsAnchor } from "./useSettingsAnchor"
import { useSettingsNavVariant } from "./useSettingsNavVariant"
import { SettingsContent } from "./variants/SettingsContent"
import { SettingsShellB } from "./variants/SettingsShellB"
import { SettingsShellC } from "./variants/SettingsShellC"
import { VariantSwitcher } from "./variants/VariantSwitcher"

export function SettingsLayout() {
  const { pathname } = useLocation()
  const fullWidth = activeSettingsTab(pathname).fullWidth === true
  const variant = useSettingsNavVariant()
  useSettingsAnchor()

  return (
    <>
      {variant === "B" ? (
        <SettingsShellB fullWidth={fullWidth} />
      ) : variant === "C" ? (
        <SettingsShellC fullWidth={fullWidth} />
      ) : (
        <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
          <SettingsSidebar />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />
            <SettingsContent fullWidth={fullWidth} />
          </div>
        </div>
      )}

      {/* TEMP: variant switcher — remove before merge */}
      <VariantSwitcher />
    </>
  )
}
