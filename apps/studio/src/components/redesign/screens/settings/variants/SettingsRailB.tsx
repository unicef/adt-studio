import { useLocation } from "@tanstack/react-router"
import { NO_DRAG_REGION } from "@/constants"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarLogo } from "../../../SidebarLogo"
import { activeSettingsTab } from "../nav"
import { SettingsNavList } from "./SettingsNavList"
import { SettingsRailFooter } from "./SettingsRailFooter"

export function SettingsRailB() {
  const { pathname } = useLocation()
  const activeKey = activeSettingsTab(pathname).key

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-3">
        <SidebarLogo />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div style={NO_DRAG_REGION} className="p-3">
          <SettingsNavList activeKey={activeKey} tone="flat" />
        </div>
      </ScrollArea>

      <SettingsRailFooter />
    </aside>
  )
}
