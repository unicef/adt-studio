import { Outlet, useLocation } from "@tanstack/react-router"
import { TopBar } from "@/components/title-bar/TopBar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { SettingsSidebar } from "./SettingsSidebar"
import { activeSettingsTab } from "./nav"

export function SettingsLayout() {
  const { pathname } = useLocation()
  const fullWidth = activeSettingsTab(pathname).fullWidth === true

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <SettingsSidebar />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />

        {fullWidth ? (
          <div className="flex min-h-0 flex-1 flex-col px-[34px] pb-6 pt-6">
            <Outlet />
          </div>
        ) : (
          <ScrollArea className="flex min-h-0 flex-1 flex-col">
            <ScrollBar className="z-10" />
            <div className="mx-auto w-full max-w-[860px] px-[34px] pb-14 pt-10">
              <Outlet />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
