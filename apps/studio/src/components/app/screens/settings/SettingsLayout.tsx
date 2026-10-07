import { useLocation } from "@tanstack/react-router"
import { TopBar } from "@/components/title-bar/TopBar"
import { SettingsSidebar } from "./SettingsSidebar"
import { activeSettingsTab } from "./nav"
import { useSettingsAnchor } from "./useSettingsAnchor"
import { SettingsContent } from "./SettingsContent"

export function SettingsLayout() {
  const { pathname } = useLocation()
  const fullWidth = activeSettingsTab(pathname).fullWidth === true
  useSettingsAnchor()

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <SettingsSidebar />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar className="shrink-0 drag-region" />
        <SettingsContent fullWidth={fullWidth} />
      </div>
    </div>
  )
}
