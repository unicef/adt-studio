import { useEffect } from "react"
import { useLocation } from "@tanstack/react-router"
import { TopBar } from "@/components/title-bar/TopBar"
import { scrollBehavior } from "@/lib/utils"
import { SettingsSidebar } from "./SettingsSidebar"
import { activeSettingsTab, sectionAnchor } from "./nav"
import { useSettingsAnchor } from "./useSettingsAnchor"
import { useSettingsLayoutVariant } from "./useSettingsLayoutVariant"
import { SettingsLayoutProvider } from "./SettingsLayoutContext"
import { SettingsContent } from "./variants/SettingsContent"
import { SettingsAllSections } from "./variants/SettingsAllSections"
import { SettingsDevSwitcher } from "./variants/SettingsDevSwitcher"

export function SettingsLayout() {
  const { pathname, hash } = useLocation()
  const layout = useSettingsLayoutVariant()
  const sections = layout === "sections"
  const fullWidth = !sections && activeSettingsTab(pathname).fullWidth === true
  useSettingsAnchor()

  useEffect(() => {
    if (!sections || hash) return
    const key = activeSettingsTab(pathname).key
    const el = document.getElementById(sectionAnchor(key))
    if (!el) return
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "start", behavior: scrollBehavior() })
    })
    return () => cancelAnimationFrame(frame)
  }, [sections, pathname, hash])

  return (
    <SettingsLayoutProvider layout={layout}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        <SettingsSidebar />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />
          <SettingsContent fullWidth={fullWidth}>
            {sections ? <SettingsAllSections /> : undefined}
          </SettingsContent>
        </div>
      </div>

      {/* TEMP: settings experiment switcher — remove before merge */}
      <SettingsDevSwitcher />
    </SettingsLayoutProvider>
  )
}
