import { TopBar } from "@/components/title-bar/TopBar"
import { SettingsTopTabs } from "./SettingsTopTabs"
import { SettingsContent } from "./SettingsContent"

export function SettingsShellC({ fullWidth }: { fullWidth: boolean }) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />
      <SettingsTopTabs />
      <SettingsContent fullWidth={fullWidth} />
    </div>
  )
}
